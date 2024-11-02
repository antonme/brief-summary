import { fetchAndStream } from './gpt.js';

export async function fetchAndStreamSummary(port, content, profile) {
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

  let messages = [
    {
      role: 'system',
      content: systemMessage,
    },
    {
      role: 'user',
      content:  'Instructions: ' + instructions + '\n\n' + 'Web page contents: ' + content,
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
          const { content, profile } = msg;
          fetchAndStreamSummary(port, content, profile);
        }
      });
    }
  });
}
