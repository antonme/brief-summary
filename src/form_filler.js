import { fetchAndStream } from './gpt.js';

async function fetchAndStreamFormFill(port, prompt, extra) {
  let messages = [
    {role: 'system', content: 'You are a browser extension that helps the user fill in a form.'},
  ]

  if (extra != null && extra.length > 0) {
    messages.push({role: 'user', content: `For context, the page contains the following text: ${extra}`});
  }

  messages.push({role: 'user', content: 'Do not wrap your response in quotes.'});
  messages.push({role: 'user', content: prompt});

  return fetchAndStream(port, messages);
}

export function connectFormFiller() {
  chrome.runtime.onInstalled.addListener(() => {
    chrome.contextMenus.create({
      id: 'fillForm',
      title: 'Fill with text using GPT',
      contexts: ['editable'],
      documentUrlPatterns: ['<all_urls>']
    });
  });

  chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId == 'fillForm') {
      const port = chrome.tabs.connect(tab.id, {name: 'fillForm'});
      port.postMessage({action: 'displayOverlay'});

      port.onMessage.addListener((msg) => {
        if (msg.action == 'getCompletion') {
          fetchAndStreamFormFill(port, msg.text, msg.extra);
        }
      });
    }
  });
}
