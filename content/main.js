/* ZotTagClear - MIT License, Copyright (c) 2026 Wei Win Loy */
"use strict";

var ZotTagClear = {
  windows: new Set(),
  menus: [],
  busy: false,
  stopped: false,

  async init({ id, rootURI }) {
    this.id = id;
    this.rootURI = rootURI;
    this.backupPath = PathUtils.join(Zotero.DataDirectory.dir, "zottagclear-last-cleanup.json");
    this.storage = {
      read: async () => {
        if (!await IOUtils.exists(this.backupPath)) return null;
        return JSON.parse(await IOUtils.readUTF8(this.backupPath));
      },
      write: async backup => IOUtils.writeJSON(this.backupPath, backup, { tmpPath: this.backupPath + ".tmp" }),
      clear: async () => IOUtils.remove(this.backupPath, { ignoreAbsent: true })
    };
    Zotero.ftl.addResourceIds(["zottagclear.ftl"]);
    this.registerMenus();
    for (const window of Zotero.getMainWindows()) this.addWindow(window);
  },

  getWindow(event, context) {
    return context?.menuElem?.ownerGlobal || event?.target?.ownerGlobal || Zotero.getMainWindow();
  },

  definitions(context = "all") {
    const collectionEntries = [
      { key: "collection-auto", label: "Remove automatic tags from selected collection…", scope: "collection", mode: "automatic" },
      { key: "collection-all", label: "Remove all tags from selected collection…", scope: "collection", mode: "all" }
    ];
    const selectedEntries = [
      { key: "selected-auto", label: "Remove automatic tags from selected items…", scope: "selected", mode: "automatic" },
      { key: "selected-all", label: "Remove all tags from selected items…", scope: "selected", mode: "all" }
    ];
    if (context === "collection") return collectionEntries;
    if (context === "items") return selectedEntries;
    return [
      ...collectionEntries,
      { separator: true },
      ...selectedEntries,
      { separator: true },
      { key: "restore", label: "Restore last cleanup…", restore: true },
      { separator: true },
      { key: "prevent", label: "Prevent automatic tags on future imports", prevent: true }
    ];
  },

  selectedCollection(pane) {
    try {
      // Zotero 10 permits mixed and multiple row selections. Require exactly one
      // real collection; a library root or saved search must never widen scope.
      const rows = pane?.getCollectionTreeRows();
      const collections = pane?.getSelectedCollections();
      if (rows?.length !== 1 || !rows[0].isCollection()
          || collections?.length !== 1 || !collections[0] || collections[0].deleted) return null;
      return collections[0];
    }
    catch (error) {
      // A reader or detached note window may not have a collections view.
      return null;
    }
  },

  actionEnabled(win, entry) {
    if (this.busy || this.stopped) return false;
    const pane = win?.ZoteroPane;
    if (entry.scope === "selected") return !!pane?.getSelectedItems().length;
    if (entry.scope === "collection") {
      const collection = this.selectedCollection(pane);
      const library = collection && Zotero.Libraries.get(collection.libraryID);
      return !!library?.editable && library.libraryType !== "feed";
    }
    return true;
  },

  registerMenus() {
    for (const [target, contextName] of [["main/menubar/tools", "all"],
        ["main/library/item", "items"], ["main/library/collection", "collection"]]) {
      const menus = this.definitions(contextName).map(entry => {
        if (entry.separator) return { menuType: "separator" };
        return {
          menuType: "menuitem", l10nID: "zottagclear-" + entry.key,
          onShowing: (event, context) => {
            const win = this.getWindow(event, context);
            context.setEnabled(this.actionEnabled(win, entry));
            if (entry.prevent && context.menuElem) {
              context.menuElem.setAttribute("type", "checkbox");
              context.menuElem.setAttribute("checked", String(!Zotero.Prefs.get("automaticTags")));
            }
          },
          onCommand: (event, context) => this.dispatch(this.getWindow(event, context), entry)
        };
      });
      const menuID = Zotero.MenuManager.registerMenu({
        menuID: "zottagclear-" + (contextName === "all" ? "tools" : contextName), pluginID: this.id,
        target, menus: [{ menuType: "submenu", l10nID: "zottagclear-title", menus }]
      });
      if (!menuID) throw new Error("Could not register ZotTagClear menus.");
      this.menus.push(menuID);
    }
  },

  addWindow(win) {
    if (this.stopped || !win || win.closed) return;
    const doc = win.document;
    if (doc.getElementById("zottagclear-button")) return;
    const toolbar = doc.getElementById("zotero-items-toolbar");
    if (!toolbar) return;
    win.MozXULElement.insertFTLIfNeeded("zottagclear.ftl");
    const button = doc.createXULElement("toolbarbutton");
    button.id = "zottagclear-button";
    button.setAttribute("class", "zotero-tb-button");
    button.setAttribute("type", "menu");
    button.setAttribute("wantdropmarker", "true");
    button.setAttribute("label", "Clear Tags");
    button.setAttribute("tooltiptext", "ZotTagClear: clear tags in the selected collection or selected items");
    button.setAttribute("aria-label", "Clear Tags");
    button.setAttribute("image", this.rootURI + "icons/toolbar.svg");
    button.style.listStyleImage = 'url("' + this.rootURI + 'icons/toolbar.svg")';
    button.style.setProperty("-moz-context-properties", "fill, stroke");
    button.style.setProperty("fill", "currentColor");
    button.style.minWidth = "30px";
    const popup = doc.createXULElement("menupopup");
    const entries = this.definitions();
    for (const entry of entries) {
      const node = doc.createXULElement(entry.separator ? "menuseparator" : "menuitem");
      if (!entry.separator) {
        node.setAttribute("label", entry.label);
        node.dataset.action = entry.key;
        if (entry.prevent) node.setAttribute("type", "checkbox");
        node.addEventListener("command", event => {
          if (event.target === node) this.dispatch(win, entry);
        });
      }
      popup.appendChild(node);
    }
    popup.addEventListener("popupshowing", event => {
      if (event.target !== popup) return;
      for (const node of popup.querySelectorAll("menuitem")) {
        node.disabled = !this.actionEnabled(win,
          entries.find(entry => entry.key === node.dataset.action));
        if (node.dataset.action === "prevent") {
          node.setAttribute("checked", String(!Zotero.Prefs.get("automaticTags")));
        }
      }
    });
    button.appendChild(popup);
    const anchor = toolbar.querySelector('spacer[flex="1"]');
    toolbar.insertBefore(button, anchor);
    this.windows.add(win);
  },

  removeWindow(win) {
    win?.document?.getElementById("zottagclear-button")?.remove();
    this.windows.delete(win);
  },

  alert(win, message) {
    Services.prompt.alert(win, "ZotTagClear", message);
  },

  confirm(win, message, action) {
    const p = Services.prompt;
    const flags = p.BUTTON_POS_0 * p.BUTTON_TITLE_IS_STRING
      + p.BUTTON_POS_1 * p.BUTTON_TITLE_CANCEL + p.BUTTON_POS_1_DEFAULT;
    return p.confirmEx(win, "ZotTagClear", message, flags, action, null, null, null, {}) === 0;
  },

  async dispatch(win, entry) {
    if (this.busy || this.stopped) return;
    this.busy = true;
    try {
      if (entry.prevent) {
        // Use Zotero's native import preference; do not modify incoming sync items.
        Zotero.Prefs.set("automaticTags", !Zotero.Prefs.get("automaticTags"));
      }
      else if (entry.restore) await this.restore(win);
      else await this.cleanup(win, entry.scope, entry.mode);
    }
    catch (error) {
      Zotero.logError(error);
      this.alert(win, "The operation could not finish.\n\n" + error.message);
    }
    finally {
      this.busy = false;
    }
  },

  async cleanup(win, scope, mode) {
    if (!win?.ZoteroPane) throw new Error("Open the Zotero library window first.");
    const pane = win.ZoteroPane;
    let items;
    let target;
    let plan;
    if (scope === "selected") {
      items = pane.getSelectedItems();
      target = "the selected items";
      if (!items.length) { this.alert(win, "Select the items you want to clean first."); return; }
      plan = await ZotTagClearCore.plan(Zotero, items, mode);
    }
    else if (scope === "collection") {
      const collection = this.selectedCollection(pane);
      if (!collection) {
        throw new Error("Select one collection or subcollection in the left pane first.");
      }
      target = 'the collection "' + collection.name + '"';
      plan = await ZotTagClearCore.collectionPlan(Zotero, collection, mode);
    }
    else throw new Error("Invalid cleanup scope.");
    if (!plan.entries.length) {
      this.alert(win, "No " + (mode === "automatic" ? "automatic " : "")
        + "tags to remove from " + target + "."
        + (plan.skipped ? "\n\n" + plan.skipped + " unavailable or read-only items were skipped." : ""));
      return;
    }
    const message = "Remove " + plan.tagCount + (mode === "automatic" ? " automatic" : "")
      + " tag assignments from " + plan.entries.length + " items in " + target + "?\n\n"
      + (scope === "collection" ? "Only direct members of this collection are included. Nested subcollections and child attachments or notes are excluded.\n\n"
        + "Tags belong to items. These changes also appear in other collections containing the same items.\n\n" : "")
      + (mode === "all" ? "This includes manually added tags.\n\n" : "Manually added tags will be kept.\n\n")
      + "Restore last cleanup will keep a copy of these removed tags. A new cleanup replaces the previous restore copy."
      + (plan.skipped ? "\n\nSkipped " + plan.skipped + " unavailable or read-only items." : "");
    if (!this.confirm(win, message, "Remove Tags")) return;
    const result = await ZotTagClearCore.apply(Zotero, plan, this.storage);
    this.alert(win, "Removed " + result.tagCount + " tag assignments from " + result.itemCount
      + " items.\n\nUse Clear Tags → Restore last cleanup to put them back.");
  },

  async restore(win) {
    const backup = await this.storage.read();
    if (!backup?.entries?.length) { this.alert(win, "There is no cleanup to restore."); return; }
    ZotTagClearCore.validateBackup(backup);
    if (!this.confirm(win, "Restore removed tags from the last cleanup (" + backup.entries.length
        + " items)?\n\nAny tags added since that cleanup will be kept.", "Restore Tags")) return;
    const result = await ZotTagClearCore.restore(Zotero, this.storage);
    this.alert(win, "Restored " + result.tagCount + " tags across " + result.itemCount + " items."
      + (result.skipped ? "\n\n" + result.skipped + " unavailable or read-only items remain in the restore copy." : ""));
  },

  async shutdown() {
    this.stopped = true;
    for (const win of [...this.windows]) this.removeWindow(win);
    for (const id of this.menus) Zotero.MenuManager.unregisterMenu(id);
    this.menus = [];
    Zotero.ftl.removeResourceIds(["zottagclear.ftl"]);
  }
};
