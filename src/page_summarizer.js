import { fetchAndStream } from './gpt.js';

export async function fetchAndStreamSummary(port, content, profile, url) {
  const { profiles, defaultProfile } = await chrome.storage.sync.get(['profiles', 'defaultProfile']);

  if (!profile) {
    profile = defaultProfile;
  }

  const profileKey = `profile__${profile}`;
  const profileData = await chrome.storage.sync.get(profileKey);
  const profileItem=profileData[profileKey];

  let instructions = profileItem.customPrompts;
  let model=profileItem.model;
  let systemMessage=profileItem.systemMessage;

  // Load cached summaries from other profiles
  let additionalContext = "";

  try {
    const cacheData = await chrome.storage.local.get("results");
    const results = cacheData.results || {};

    const currentProfileKey = `profile__${profile}`;

    // Get all profile keys except current one
    const otherProfileKeys = Object.keys(results).filter(
      key => key !== currentProfileKey && key.startsWith('profile__')
    );

    // Collect summaries from other profiles for this URL
    const otherSummaries = [];
    for (const profileKey of otherProfileKeys) {
      const profileCache = results[profileKey];
      if (profileCache && profileCache[url]) {
        const cached = profileCache[url];
        const profileName = profileKey.replace('profile__', '');
        otherSummaries.push({
          profileName: profileName,
          summary: cached.summary,
          model: cached.model
        });
      }
    }

    // Construct additional context if other summaries exist
    if (otherSummaries.length > 0) {
      additionalContext = "\n\nHere is additional info about that page that you may use:\n\n";

      for (const other of otherSummaries) {
        additionalContext += `[Analysis from profile "${other.profileName}" using ${other.model}]:\n`;
        additionalContext += `${other.summary}\n\n`;
      }
    }
  } catch (error) {
    console.error('Error loading other profiles cache:', error);
    // Continue without additional context if error occurs
  }

  let messages = [
    {
      role: 'system',
      content: systemMessage,
    },
    {
      role: 'user',
      content:  'Instructions: ' + instructions + additionalContext + '\n\nWeb page contents: ' + content,
    }
  ];
console.log("Messages: ", messages);
  return fetchAndStream(port, messages, model, profile);
}

export function connectPageSummarizer() {
  chrome.runtime.onConnect.addListener((port) => {
    if (port.name == 'summarize') {
      port.onMessage.addListener((msg) => {
        if (msg.action == 'SUMMARIZE') {
          const { content, profile, url } = msg;
          fetchAndStreamSummary(port, content, profile, url);
        }
      });
    }
  });
}
