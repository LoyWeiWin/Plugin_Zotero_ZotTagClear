# ZotTagClear v1.0.2

Clear tags from the selected collection or subcollection. Version 1.0.2 replaces the previous whole-library actions and adds the collection actions to the collection context menu, Clear Tags toolbar menu and Tools submenu.

## Use

1. Install `ZotTagClear_v1.0.2.xpi` through **Tools → Plugins** in Zotero.
2. Select one collection or subcollection in the left pane.
3. Choose **Clear Tags → Remove automatic tags from selected collection…** or **Remove all tags from selected collection…**.
4. Check the collection name and counts, then confirm removal.

Only direct members of the selected collection are included. Nested subcollections and child attachments or notes are excluded; standalone notes or attachments directly filed in the selected collection are included. Quick-search and tag filters do not change the collection's cleanup scope.

Tags belong to items. Changes to an item filed in several collections appear wherever that item is listed. Other items with the same tag names keep their tags.

The last-cleanup restore and selected-item actions remain available. Automatic-only cleanup keeps tags stored as manual tags, including imported tags marked manual. The same add-on ID and restore-file format are retained when updating from v1.0.1.

## Validation

Automated checks cover collection boundaries, empty collections, mixed selections, read-only records, cancellation, membership changes during confirmation and restore. These checks use a simulated Zotero API; the release has not been exercised in a live Zotero Desktop session here.

**Compatibility:** Zotero 10.0.x · **Author:** Wei Win Loy · **Licence:** MIT
