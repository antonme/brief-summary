import { connectPageSummarizer } from './page_summarizer.js';

import {
  setDefaultConfig,
  updateConfigToUseProfiles_20231117,
  updateModelNaming_20240129,
  updateModelNaming_20240423,
  updateProfileStructure_20240620,
} from './compat.js';

// Summarize page
connectPageSummarizer();

if (typeof browser == "undefined") {
  // Chrome does not support the browser namespace yet.
  globalThis.browser = chrome;
}

// Automatically upgrade the user's config if they are still using the old config format.
browser.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === 'install' || details.reason === 'update') {
    await setDefaultConfig();
  }
});
