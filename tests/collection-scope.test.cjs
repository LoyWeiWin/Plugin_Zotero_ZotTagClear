/* ZotTagClear - MIT License, Copyright (c) 2026 Wei Win Loy */
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const Core = require("../content/core.js");

const copy = value => JSON.parse(JSON.stringify(value));

function fixture() {
  const items = new Map();
  const collections = new Map();
  const libraries = new Map([[1, { editable: true, libraryType: "user" }],
    [2, { editable: true, libraryType: "group" }]]);
  const saved = [];
  const makeItem = (id, tags, extra = {}) => {
    const item = { id, key: "ITEM" + String(id).padStart(4, "0"), libraryID: 1,
      deleted: false, parentID: null, tags: copy(tags), ...extra,
      isEditable() { return this.editable !== false; },
      getTags() { return copy(this.tags); },
      setTags(tags) { this.tags = copy(tags); },
      async save() { saved.push(this.id); }
    };
    items.set(id, item);
    return item;
  };
  const makeCollection = (id, name, memberIDs, parentID = null) => {
    const collection = { id, key: "COLL" + String(id).padStart(4, "0"),
      libraryID: 1, name, parentID, deleted: false, memberIDs: [...memberIDs], childItemsLoaded: false,
      async loadDataType(type) { assert.equal(type, "childItems"); this.childItemsLoaded = true; },
      getChildItems() {
        assert.equal(this.childItemsLoaded, true, "Zotero requires loaded child-item data");
        return this.memberIDs.map(id => items.get(id)).filter(item => !item.deleted);
      }
    };
    collections.set(id, collection);
    return collection;
  };
  const tags = [{ tag: "imported", type: 1 }, { tag: "reviewed", type: 0 }];
  const first = makeItem(1, tags);
  const shared = makeItem(2, tags);
  const parentOnly = makeItem(3, tags);
  const siblingOnly = makeItem(4, tags);
  const nestedOnly = makeItem(5, tags);
  const outside = makeItem(6, tags);
  const attachment = makeItem(7, tags, { parentID: 1 });
  const note = makeItem(8, tags, { parentID: 1 });
  const parent = makeCollection(10, "Research", [3]);
  const chosen = makeCollection(11, "Included papers", [1, 2], parent.id);
  const sibling = makeCollection(12, "Excluded papers", [2, 4], parent.id);
  const nested = makeCollection(13, "Later", [5], chosen.id);
  let backup = null;
  let writes = 0;
  const storage = {
    async read() { return copy(backup); },
    async write(value) { writes++; backup = copy(value); },
    async clear() { backup = null; }
  };
  const Z = {
    Libraries: { get: id => libraries.get(id) },
    Collections: { async getAsync(id) { return collections.get(id); } },
    Items: {
      async getAsync(id) { return items.get(id); },
      async getByLibraryAndKeyAsync(libraryID, key) {
        return [...items.values()].find(item => item.libraryID === libraryID && item.key === key);
      },
      async loadDataTypes() {},
      getAll() { throw new Error("Collection cleanup must never read the whole library"); }
    },
    DB: { async executeTransaction(callback) { return callback(); } },
    UndoHistory: { stageAction() {} },
    logError(error) { throw error; }
  };
  const context = { Zotero: Z, ZotTagClearCore: Core };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../content/main.js"), "utf8"), context);
  const app = context.ZotTagClear;
  app.storage = storage;
  const alerts = [];
  const confirmations = [];
  app.alert = (win, message) => alerts.push(message);
  app.confirm = (win, message) => { confirmations.push(message); return true; };
  const state = { rows: [{ isCollection: () => true }], collections: [chosen] };
  const pane = {
    getCollectionTreeRows: () => state.rows,
    getSelectedCollections: () => state.collections,
    getSelectedItems: () => [outside],
    getSortedItems() { throw new Error("Collection scope must not depend on visible filters"); },
    getSelectedCollection() { throw new Error("Removed Zotero 10 API"); },
    getSelectedLibraryIDs() { throw new Error("Library scope must not be used"); }
  };
  return { Z, app, storage, items, collections, libraries, saved, alerts, confirmations,
    state, win: { ZoteroPane: pane }, first, shared, parentOnly, siblingOnly, nestedOnly,
    outside, attachment, note, parent, chosen, sibling, nested,
    backup: () => backup, writes: () => writes };
}

test("automatic cleanup changes only direct members of the chosen subcollection", async () => {
  const f = fixture();
  const before = new Map([...f.items].map(([id, item]) => [id, item.getTags()]));
  await f.app.cleanup(f.win, "collection", "automatic");
  for (const item of [f.first, f.shared]) {
    assert.deepEqual(item.getTags(), [{ tag: "reviewed", type: 0 }]);
  }
  for (const item of [f.parentOnly, f.siblingOnly, f.nestedOnly, f.outside, f.attachment, f.note]) {
    assert.deepEqual(item.getTags(), before.get(item.id));
  }
  assert.deepEqual(f.saved, [1, 2]);
  assert.match(f.confirmations[0], /2 items in the collection "Included papers"/);
  assert.match(f.confirmations[0], /Nested subcollections/);
  assert.match(f.confirmations[0], /other collections containing the same items/);
  await f.sibling.loadDataType("childItems");
  assert.equal(f.sibling.getChildItems()[0], f.shared, "shared membership refers to the same item");
});

test("all-tag cleanup keeps unrelated items with the same tag names intact", async () => {
  const f = fixture();
  await f.app.cleanup(f.win, "collection", "all");
  assert.deepEqual(f.first.tags, []);
  assert.deepEqual(f.shared.tags, []);
  assert.equal(f.outside.tags.length, 2);
  assert.equal(f.siblingOnly.tags.length, 2);
  assert.match(f.confirmations[0], /4 tag assignments/);
});

test("manual tags imported as type 0 are preserved in automatic-only mode", async () => {
  const f = fixture();
  f.first.tags.push({ tag: "imported-as-manual", type: 0 });
  await f.app.cleanup(f.win, "collection", "automatic");
  assert.deepEqual(f.first.tags.map(tag => tag.tag), ["reviewed", "imported-as-manual"]);
});

test("an empty collection never falls back to selected items or the library", async () => {
  const f = fixture();
  f.chosen.memberIDs = [];
  await f.app.cleanup(f.win, "collection", "all");
  assert.equal(f.saved.length, 0);
  assert.equal(f.confirmations.length, 0);
  assert.equal(f.writes(), 0);
  assert.match(f.alerts[0], /No tags to remove/);
});

test("standalone notes or attachments directly filed in the collection are included", async () => {
  const f = fixture();
  f.attachment.parentID = null;
  f.chosen.memberIDs.push(f.attachment.id);
  await f.app.cleanup(f.win, "collection", "all");
  assert.deepEqual(f.attachment.tags, []);
  assert.equal(f.note.tags.length, 2);
});

for (const [name, selection] of [
  ["library root", f => { f.state.rows = [{ isCollection: () => false }]; f.state.collections = []; }],
  ["saved search", f => { f.state.rows = [{ isCollection: () => false }]; f.state.collections = []; }],
  ["multiple collections", f => { f.state.rows.push({ isCollection: () => true }); f.state.collections.push(f.sibling); }],
  ["collection plus library", f => { f.state.rows.push({ isCollection: () => false }); }],
  ["collection plus search", f => { f.state.rows.push({ isCollection: () => false }); }],
  ["no selection", f => { f.state.rows = []; f.state.collections = []; }]
]) {
  test(name + " disables and rejects collection cleanup without modifying anything", async () => {
    const f = fixture();
    selection(f);
    assert.equal(f.app.actionEnabled(f.win, { scope: "collection" }), false);
    await assert.rejects(f.app.cleanup(f.win, "collection", "all"), /Select one collection or subcollection/);
    assert.equal(f.saved.length, 0);
    assert.equal(f.writes(), 0);
  });
}

test("missing collections view is handled without falling back to the library", async () => {
  const f = fixture();
  f.win.ZoteroPane.getCollectionTreeRows = () => { throw new Error("No collections view"); };
  assert.equal(f.app.actionEnabled(f.win, { scope: "collection" }), false);
  await assert.rejects(f.app.cleanup(f.win, "collection", "all"), /Select one collection/);
  assert.equal(f.saved.length, 0);
});

test("read-only and feed libraries cannot be cleaned through collection scope", async () => {
  for (const library of [{ editable: false, libraryType: "group" }, { editable: true, libraryType: "feed" }]) {
    const f = fixture();
    f.libraries.set(1, library);
    assert.equal(f.app.actionEnabled(f.win, { scope: "collection" }), false);
    await assert.rejects(f.app.cleanup(f.win, "collection", "all"), /cannot be edited/);
    assert.equal(f.saved.length, 0);
  }
});

test("trashed and individually read-only members are skipped", async () => {
  const f = fixture();
  f.first.deleted = true;
  f.shared.editable = false;
  await f.app.cleanup(f.win, "collection", "all");
  assert.equal(f.saved.length, 0);
  assert.match(f.alerts[0], /1 unavailable or read-only items were skipped/);
});

test("cancel leaves tags and the previous restore copy unchanged", async () => {
  const f = fixture();
  await f.storage.write({ previous: true });
  const previous = copy(f.backup());
  f.app.confirm = () => false;
  await f.app.cleanup(f.win, "collection", "all");
  assert.equal(f.saved.length, 0);
  assert.equal(f.first.tags.length, 2);
  assert.deepEqual(f.backup(), previous);
  assert.equal(f.writes(), 1);
});

test("an item leaving the collection during confirmation aborts before any writes", async () => {
  const f = fixture();
  const plan = await Core.collectionPlan(f.Z, f.chosen, "all");
  f.chosen.memberIDs = [f.first.id];
  await assert.rejects(Core.apply(f.Z, plan, f.storage), /left the collection/);
  assert.equal(f.saved.length, 0);
  assert.equal(f.writes(), 0);
  assert.equal(f.first.tags.length, 2);
});

test("deleting the selected collection after preview aborts cleanup", async () => {
  const f = fixture();
  const plan = await Core.collectionPlan(f.Z, f.chosen, "all");
  f.collections.delete(f.chosen.id);
  await assert.rejects(Core.apply(f.Z, plan, f.storage), /collection changed/);
  assert.equal(f.saved.length, 0);
  assert.equal(f.writes(), 0);
});

test("tag changes during confirmation abort before replacing the restore copy", async () => {
  const f = fixture();
  const plan = await Core.collectionPlan(f.Z, f.chosen, "all");
  f.shared.tags.push({ tag: "new", type: 0 });
  await assert.rejects(Core.apply(f.Z, plan, f.storage), /items changed/);
  assert.equal(f.saved.length, 0);
  assert.equal(f.writes(), 0);
});

test("restore recovers the collection cleanup and preserves later tag additions", async () => {
  const f = fixture();
  await f.app.cleanup(f.win, "collection", "all");
  f.first.tags.push({ tag: "added-later", type: 0 });
  const result = await Core.restore(f.Z, f.storage);
  assert.equal(result.itemCount, 2);
  assert.equal(result.tagCount, 4);
  assert.deepEqual(f.first.tags.map(tag => tag.tag).sort(), ["added-later", "imported", "reviewed"]);
  assert.equal(f.shared.tags.length, 2);
  assert.equal(f.outside.tags.length, 2);
  assert.equal(f.backup(), null);
});

test("selected-item cleanup remains independent of collection actions", async () => {
  const f = fixture();
  await f.app.cleanup(f.win, "selected", "all");
  assert.deepEqual(f.outside.tags, []);
  assert.equal(f.first.tags.length, 2);
  assert.deepEqual(f.saved, [f.outside.id]);
});

test("whole-library actions are absent and the old scope is rejected", async () => {
  const f = fixture();
  assert.equal(f.app.definitions().some(entry => entry.scope === "library"), false);
  assert.deepEqual(Array.from(f.app.definitions("collection"), entry => entry.scope), ["collection", "collection"]);
  await assert.rejects(f.app.cleanup(f.win, "library", "all"), /Invalid cleanup scope/);
  assert.equal(f.saved.length, 0);
});

test("Tools, item, and collection context menus use the same enabled-state checks", () => {
  const f = fixture();
  const menus = [];
  f.app.id = "zottagclear@loy.tools";
  f.Z.MenuManager = { registerMenu(menu) { menus.push(menu); return menu.menuID; } };
  f.app.registerMenus();
  assert.deepEqual(menus.map(menu => menu.target), ["main/menubar/tools", "main/library/item", "main/library/collection"]);
  const collectionMenu = menus[2].menus[0].menus;
  assert.equal(collectionMenu.length, 2);
  for (const entry of collectionMenu) {
    let enabled;
    const context = { menuElem: { ownerGlobal: f.win }, setEnabled: value => { enabled = value; } };
    entry.onShowing(null, context);
    assert.equal(enabled, true);
    f.app.busy = true;
    entry.onShowing(null, context);
    assert.equal(enabled, false);
    f.app.busy = false;
  }
});
