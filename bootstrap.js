/* ZotTagClear - MIT License, Copyright (c) 2026 Wei Win Loy */
var ZotTagClearCore;
var ZotTagClear;

async function startup(data, reason) {
  Services.scriptloader.loadSubScript(data.rootURI + "content/core.js", globalThis);
  Services.scriptloader.loadSubScript(data.rootURI + "content/main.js", globalThis);
  await ZotTagClear.init(data);
}

async function shutdown(data, reason) {
  if (ZotTagClear) await ZotTagClear.shutdown();
}

function onMainWindowLoad({ window }) {
  if (ZotTagClear) ZotTagClear.addWindow(window);
}

function onMainWindowUnload({ window }) {
  if (ZotTagClear) ZotTagClear.removeWindow(window);
}

async function install(data) {
  // Standalone distribution: no hosted update channel has been published.
  // Change only this add-on's update policy, never Zotero's global settings.
  const { AddonManager } = ChromeUtils.importESModule("resource://gre/modules/AddonManager.sys.mjs");
  const addon = await AddonManager.getAddonByID(data.id);
  if (addon) addon.applyBackgroundUpdates = AddonManager.AUTOUPDATE_DISABLE;
}
function uninstall() {}
