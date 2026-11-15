# Changelog

## 1.0.2 — 15 November 2026

- Replace whole-library cleanup actions with actions for one selected collection or subcollection.
- Use direct collection membership, independently of quick-search, tag filters and the recursive-collection display preference.
- Add collection actions to the collection context menu, toolbar and Tools submenu.
- Disable collection actions for library roots, saved searches, mixed selections and multiple collections.
- Show the collection name and item/tag counts before removal; explain how tags on shared items behave.
- Recheck collection membership before applying the confirmed cleanup.
- Preserve selected-item cleanup, automatic-only and all-tag modes, and last-cleanup restore.
- Add automated collection-boundary checks and a reproducible package builder.

## 1.0.1 — 13 November 2026

- Remove automatic tags or all tags from selected items or one current library.
- Access actions from the Clear Tags toolbar button, Tools menu and item context menu.
- Review affected item and tag-assignment counts before removal.
- Restore the most recent cleanup while keeping later tag additions.
- Retain pending restore entries for unavailable or read-only items.
- Toggle Zotero's automatic-tag import preference.
- Include embedded PNG and SVG icons and an MIT licence.
- Target Zotero 10.0.x with manual XPI updates.
