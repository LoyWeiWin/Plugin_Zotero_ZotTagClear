<img src="icons/icon.svg" alt="ZotTagClear icon" width="80" height="80">

# ZotTagClear

Remove automatic tags or all tags from one selected Zotero collection or subcollection, or from selected items, with an option to restore the last cleanup.

**Version:** 1.0.2 · **Author:** Wei Win Loy · **Licence:** [GPLV3](LICENSE)

## Compatibility

The add-on manifest targets **Zotero 10.0.x**.

## Install

1. Download `ZotTagClear_v1.0.2.xpi`.
2. In Zotero, open **Tools → Plugins** and drag the XPI onto the Plugins window.
3. Follow Zotero's prompts and restart if requested.
4. Look for **Clear Tags** above the item list or **Tools → ZotTagClear**.

Install the XPI directly. The source ZIP contains editable files.

## Features

| Action | Result |
| --- | --- |
| Remove automatic tags from selected collection | Removes automatic tags from direct members of the selected collection or subcollection. |
| Remove all tags from selected collection | Removes automatic and manual tags from those direct members. |
| Remove automatic tags from selected items | Removes tags marked automatic by Zotero and keeps manual tags. |
| Remove all tags from selected items | Removes automatic and manual tags from the selected records. |
| Restore last cleanup | Adds removed tags back while keeping tags added afterward. |
| Prevent automatic tags on future imports | Toggles Zotero's automatic-tag import preference. |

The toolbar button and Tools submenu provide all actions. Right-clicking a collection provides the two collection actions; right-clicking items provides the two selected-item actions. Each cleanup shows the target, affected item count and tag-assignment count before asking for confirmation.

## Clean a subcollection

1. Select the subcollection in Zotero's left pane.
2. Open **Clear Tags** and choose **Remove automatic tags from selected collection…** or **Remove all tags from selected collection…**.
3. Check the collection name and counts, then click **Remove Tags**.

Collection actions use the collection's direct membership even when quick-search or tag filters hide some items. Nested subcollections are excluded. An empty collection stays empty; cleanup never expands to the whole library. Select exactly one collection: collection actions are disabled for library roots, saved searches and mixed or multiple selections.

## Scope and restore

- **Automatic tags:** Only tags Zotero marks automatic are removed in automatic-only mode. Imported tags stored as manual tags are kept.
- **Selected collection:** Only direct members of that collection are included. Parent and sibling collections and nested subcollections do not add items to the cleanup. Child attachments and notes are excluded unless they are standalone items directly filed in the selected collection.
- **Shared items:** Zotero stores tags on items, not separately in each collection. When the same item belongs to several collections, its changed tags appear in all of them. Unrelated items with the same tag names keep their tags. See [Zotero's collections model](https://www.zotero.org/support/collections_and_tags#the_zotero_collections_model).
- **Selected items:** Only the selected records are changed. Selecting a parent item alone does not include its children.
- **Library scope:** Whole-library cleanup actions were removed in version 1.0.2.
- **Unavailable records:** Read-only, feed and trashed items, including children of trashed parents, are skipped.
- **Changes during confirmation:** Cleanup stops if a targeted item leaves the collection or its tags change before removal.
- **Restore:** Only the most recent successful cleanup is stored. A new cleanup that removes tags replaces the previous restore copy. Tags added afterward are kept, and unavailable records remain pending for a later restore.

The restore copy is stored locally as `zottagclear-last-cleanup.json` in the active Zotero data directory and remains available after restarting Zotero.

## Updates

Install newer XPI versions manually. Version 1.0.2 has no hosted automatic update channel, and background updates are disabled for this add-on only. Installing v1.0.2 updates the existing add-on and keeps its last-cleanup restore file.

## Development

Run `node --test tests/collection-scope.test.cjs` with Node.js 18 or newer. These automated checks use a simulated Zotero API to verify collection boundaries, confirmation, restore and menu behaviour. They do not replace testing in Zotero Desktop.

Run `python3 scripts/build.py` to build the XPI, source ZIP and repository ZIP into `dist/`. The XPI contains runtime files and icons only. Source files and tests are provided in the development archives.

## Licence

GPLV3. Copyright © 2026 Wei Win Loy. Keep the copyright and licence notice when redistributing the source or XPI.

ZotTagClear is an independent project.
