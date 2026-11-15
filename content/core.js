/* ZotTagClear - MIT License, Copyright (c) 2026 Wei Win Loy */
"use strict";

var ZotTagClearCore = {
  copy(tags) {
    return tags.map(t => ({ tag: t.tag, type: Number(t.type || 0) }));
  },

  signature(tags) {
    return JSON.stringify(this.copy(tags).sort((a, b) =>
      a.tag.localeCompare(b.tag) || a.type - b.type));
  },

  split(tags, mode) {
    if (mode !== "automatic" && mode !== "all") throw new Error("Invalid tag mode.");
    const before = this.copy(tags);
    return {
      before,
      removed: before.filter(t => mode === "all" || t.type === 1),
      after: before.filter(t => mode !== "all" && t.type !== 1)
    };
  },

  merge(current, removed) {
    // Existing tags win, including a tag the user has since made manual.
    const result = this.copy(current);
    const names = new Set(result.map(t => t.tag));
    for (const tag of this.copy(removed)) {
      if (!names.has(tag.tag)) {
        result.push(tag);
        names.add(tag.tag);
      }
    }
    return result;
  },

  async editable(Z, item) {
    if (!item || !item.id || item.deleted || !item.isEditable()) return false;
    const library = Z.Libraries.get(item.libraryID);
    if (!library || !library.editable || library.libraryType === "feed") return false;
    // Also protect children of a trashed parent.
    let parentID = item.parentID;
    const seen = new Set([item.id]);
    while (parentID) {
      if (seen.has(parentID)) return false;
      seen.add(parentID);
      const parent = await Z.Items.getAsync(parentID);
      if (!parent || parent.deleted) return false;
      parentID = parent.parentID;
    }
    return true;
  },

  async collectionItems(Z, collection) {
    const library = collection && Z.Libraries.get(collection.libraryID);
    if (!collection?.id || collection.deleted || !library?.editable
        || library.libraryType === "feed") {
      throw new Error("The selected collection cannot be edited.");
    }
    // Read direct membership, independently of quick-search/tag filters and
    // Zotero's preference for showing items from nested subcollections.
    await collection.loadDataType("childItems");
    const items = await collection.getChildItems();
    if (!Array.isArray(items) || items.some(item => !item || item.libraryID !== collection.libraryID)) {
      throw new Error("The collection's items could not be read safely.");
    }
    return items;
  },

  async collectionPlan(Z, collection, mode) {
    const plan = await this.plan(Z, await this.collectionItems(Z, collection), mode);
    return { ...plan, collection: { id: collection.id, key: collection.key, libraryID: collection.libraryID } };
  },

  async plan(Z, items, mode) {
    const entries = [];
    let skipped = 0;
    const seen = new Set();
    // Batch-load tag data; avoid one database query per item in a large library.
    items = items.filter(Boolean);
    if (items.length) await Z.Items.loadDataTypes(items, ["tags"]);
    for (const item of items) {
      if (!item || seen.has(item.id)) continue;
      seen.add(item.id);
      if (!await this.editable(Z, item)) {
        skipped++;
        continue;
      }
      const changes = this.split(item.getTags(), mode);
      if (changes.removed.length) {
        entries.push({ libraryID: item.libraryID, key: item.key, ...changes });
      }
    }
    return { mode, entries, skipped, tagCount: entries.reduce((n, e) => n + e.removed.length, 0) };
  },

  async apply(Z, plan, storage) {
    const previous = await storage.read();
    const backup = {
      format: 1, plugin: "ZotTagClear", created: new Date().toISOString(),
      entries: plan.entries.map(({ libraryID, key, removed }) => ({ libraryID, key, removed }))
    };
    const touched = [];
    let backupWritten = false;
    try {
      await Z.DB.executeTransaction(async () => {
        const items = [];
        let memberIDs;
        if (plan.collection) {
          const collection = await Z.Collections.getAsync(plan.collection.id);
          if (!collection || collection.key !== plan.collection.key
              || collection.libraryID !== plan.collection.libraryID) {
            throw new Error("The collection changed while the confirmation was open. Please run the cleanup again.");
          }
          memberIDs = new Set((await this.collectionItems(Z, collection)).map(item => item.id));
        }
        // Revalidate the preview before touching any item or replacing a backup.
        for (const entry of plan.entries) {
          const item = await Z.Items.getByLibraryAndKeyAsync(entry.libraryID, entry.key);
          if (memberIDs && (!memberIDs.has(item?.id) || item?.libraryID !== plan.collection.libraryID)) {
            throw new Error("An item left the collection while the confirmation was open. Please run the cleanup again.");
          }
          if (!await this.editable(Z, item)
              || this.signature(item.getTags()) !== this.signature(entry.before)) {
            throw new Error("The items changed while the confirmation was open. Please run the cleanup again.");
          }
          items.push(item);
        }
        await storage.write(backup);
        backupWritten = true;
        if (Z.UndoHistory) Z.UndoHistory.stageAction("zottagclear-undo-clear");
        for (let i = 0; i < items.length; i++) {
          touched.push(items[i]);
          items[i].setTags(plan.entries[i].after);
          await items[i].save();
        }
      });
    }
    catch (error) {
      // The database transaction has rolled back. Reload earlier saved objects,
      // too, so their in-memory tags match the rolled-back database.
      for (const item of touched) {
        try { if (item.reload) await item.reload(null, true); }
        catch (reloadError) { Z.logError(reloadError); }
      }
      if (backupWritten) {
        try {
          if (previous) await storage.write(previous);
          else await storage.clear();
        }
        catch (backupError) {
          Z.logError(backupError);
        }
      }
      throw error;
    }
    return { itemCount: plan.entries.length, tagCount: plan.tagCount };
  },

  validateBackup(backup) {
    if (!backup || backup.format !== 1 || backup.plugin !== "ZotTagClear"
        || !Array.isArray(backup.entries)) throw new Error("The restore file is invalid.");
    for (const entry of backup.entries) {
      if (!Number.isInteger(entry.libraryID) || entry.libraryID < 1
          || !/^[A-Z0-9]{8}$/.test(entry.key) || !Array.isArray(entry.removed)
          || entry.removed.some(t => !t || typeof t.tag !== "string" || !t.tag.trim()
            || ![0, 1].includes(Number(t.type || 0)))) {
        throw new Error("The restore file is invalid.");
      }
    }
    return backup;
  },

  async restore(Z, storage) {
    const backup = this.validateBackup(await storage.read());
    const pending = [];
    const touched = [];
    let itemCount = 0;
    let tagCount = 0;
    try {
      await Z.DB.executeTransaction(async () => {
      if (Z.UndoHistory) Z.UndoHistory.stageAction("zottagclear-undo-restore");
      for (const entry of backup.entries) {
        const item = await Z.Items.getByLibraryAndKeyAsync(entry.libraryID, entry.key);
        if (!await this.editable(Z, item)) {
          pending.push(entry);
          continue;
        }
        await Z.Items.loadDataTypes([item], ["tags"]);
        const current = item.getTags();
        const merged = this.merge(current, entry.removed);
        if (this.signature(current) !== this.signature(merged)) {
          touched.push(item);
          item.setTags(merged);
          await item.save();
          itemCount++;
          tagCount += merged.length - current.length;
        }
      }
      });
    }
    catch (error) {
      for (const item of touched) {
        try { if (item.reload) await item.reload(null, true); }
        catch (reloadError) { Z.logError(reloadError); }
      }
      throw error;
    }
    // Repeating a restore is safe if the disk write fails after the DB commit.
    if (pending.length) await storage.write({ ...backup, entries: pending });
    else await storage.clear();
    return { itemCount, tagCount, skipped: pending.length };
  }
};

if (typeof module !== "undefined" && module.exports) module.exports = ZotTagClearCore;
