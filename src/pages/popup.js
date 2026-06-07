document.addEventListener("DOMContentLoaded", async function () {
  const query = new URLSearchParams(window.location.search);
  let tabId = query.get("tabId"); // Retrieve the tabId from URL parameters

  if (!tabId) {
    // If no tabId is found in the URL, default to the current active tab
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    tabId = tabs[0].id;
  }

  const target = document.getElementById("summary");
  const profileContainer = document.getElementById("profileContainer");

  //----------------------------------------------------------------------------
  // Mobile device detection
  //----------------------------------------------------------------------------
  const isTouchDevice =
    "ontouchstart" in window ||
    navigator.maxTouchPoints > 0 ||
    navigator.msMaxTouchPoints > 0;
  const isMobileUserAgent = /Mobi|Android/i.test(navigator.userAgent);
  const isSmallScreen = screen.width < 768;
  const isMobile = isTouchDevice && (isMobileUserAgent || isSmallScreen);

  //----------------------------------------------------------------------------
  // Tab ID
  //----------------------------------------------------------------------------

  // Returns the URL of the original tab, identified by the global tabId.
  async function getOriginalTabUrl() {
    console.log("tabId", tabId);
    const tab = await chrome.tabs.get(tabId);
    console.log("tab.url", tab.url);
    return tab.url;
  }

  //----------------------------------------------------------------------------
  // Copy summary to clipboard
  //----------------------------------------------------------------------------
  const copySummaryButton = document.getElementById("copySummary");
  const summarizeButton = document.getElementById("summarize");

  function enableCopyButton() {
    copySummaryButton.classList.remove("btn-outline-secondary");
    copySummaryButton.classList.add("btn-outline-primary");
    copySummaryButton.disabled = false;
  }

  function disableCopyButton() {
    copySummaryButton.classList.remove("btn-outline-primary");
    copySummaryButton.classList.add("btn-outline-secondary");
    copySummaryButton.disabled = true;
  }

  window.setInterval(() => {
    if (lastMessage) {
      enableCopyButton();
    } else {
      disableCopyButton();
    }
  }, 500);

  copySummaryButton.addEventListener("click", async () => {
    if (lastMessage) {
      const tabs = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });
      const urlOfPage = tabs[0].url;
      const formattedText = `Summary of ${urlOfPage}:\n\n${lastMessage}`;

      try {
        await navigator.clipboard.writeText(formattedText);
      } catch (err) {
        console.error("Failed to copy text: ", err);
      }
    }
  });

  summarizeButton.addEventListener("click", async () => {
    const stream = getStream(currentProfile);
    stream.working = true;
    stream.summary = null;
    stream.thinking = null;
    stream.thinkingComplete = false;
    stream.started = false;
    setStreamingIndicator(currentProfile, "waiting");
    await showModelWorking(currentProfile);
    await requestNewSummary();
  });

  //----------------------------------------------------------------------------
  // Display the header when in full screen mode, including the URL of the
  // current page. This is only necessary when the popup is opened in a new
  // tab, which is the case when the user clicks the "open in new window" icon,
  // or when the popup is opened on a mobile device (kiwi browser displays
  // extension popups as full screen tabs).
  //----------------------------------------------------------------------------
  async function displayHeader() {
    //document.getElementById('header').classList.remove('visually-hidden');
    //document.getElementById('sourceUrl').href = (await chrome.tabs.get(tabId)).url;
  }

  if (query.has("tabId") || isMobile) {
    displayHeader();
  }

  //----------------------------------------------------------------------------
  // Port management
  //----------------------------------------------------------------------------
  let port;
  let portIsConnected = false;

  function connectPort() {
    port = chrome.runtime.connect({ name: "summarize" });
    portIsConnected = true;

    // Attach the message listener
    port.onMessage.addListener(onMessage);

    // If the port disconnects, try to reconnect once after a short delay.
    port.onDisconnect.addListener(() => {
      portIsConnected = false;
      setTimeout(connectPort);
    });
  }

  function postMessage(msg) {
    if (!portIsConnected) {
      connectPort();
    }

    port.postMessage(msg);
  }

  connectPort();

  // Send regular "keep-alive" messages to the background script to ensure it
  // continues running for as long as the user keeps the popup open.
  setInterval(() => {
    postMessage({ action: "KEEP_ALIVE" });
  }, 1000);

  //----------------------------------------------------------------------------
  // Message listener
  //----------------------------------------------------------------------------
  let lastMessage = null;  // what's currently displayed (for copy button)
  const streams = {};  // per-profile streaming state

  function getStream(profile) {
    if (!streams[profile]) {
      streams[profile] = { summary: null, thinking: null, thinkingComplete: false, working: false, started: false };
    }
    return streams[profile];
  }

  //----------------------------------------------------------------------------
  // Model footer + loading dots
  //----------------------------------------------------------------------------
  const modelFooter = document.getElementById("modelFooter");
  const modelLabel = document.getElementById("modelLabel");
  let currentModelName = "";
  let currentEffort = "";

  // Combine model + effort into one label. Hides `dynamic` (the API-default
  // sentinel) since it has no concrete level to display.
  function formatModelDisplay() {
    if (!currentEffort || currentEffort === "dynamic") {
      return currentModelName;
    }
    return `${currentModelName} (${currentEffort})`;
  }

  async function showModelWorking(profileName) {
    const profileKey = `profile__${profileName}`;
    const profileData = await chrome.storage.sync.get(profileKey);
    currentModelName = profileData[profileKey]?.model || "unknown";
    currentEffort = profileData[profileKey]?.thinkingEffort || "";
    modelFooter.classList.add("visually-hidden");
    updateSummary(
      `<div class="d-flex align-items-center gap-2">` +
        `<div class="thinking-dots"><span></span><span></span><span></span></div>` +
        `<span class="text-muted">${formatModelDisplay()}</span>` +
      `</div>`
    );
  }

  function showModelFooter() {
    modelLabel.textContent = formatModelDisplay();
    modelFooter.classList.remove("visually-hidden");
  }

  function hideModelFooter() {
    modelFooter.classList.add("visually-hidden");
  }

  async function onMessage(msg) {
    if (msg == null) return;

    const msgProfile = msg.profile || currentProfile;
    const stream = getStream(msgProfile);
    const isCurrent = msgProfile === currentProfile;

    switch (msg.action) {
      case "GPT_THINKING":
        stream.thinking = msg.thinking;
        if (!stream.started) {
          stream.started = true;
          setStreamingIndicator(msgProfile, "streaming");
        }
        if (isCurrent) updateThinking(msg.thinking);
        break;

      case "GPT_MESSAGE":
        stream.summary = msg.summary;
        if (!stream.started) {
          stream.started = true;
          setStreamingIndicator(msgProfile, "streaming");
        }
        if (stream.thinking && !stream.thinkingComplete) {
          stream.thinkingComplete = true;
          if (isCurrent) collapseThinking();
        }
        if (isCurrent) {
          lastMessage = msg.summary;
          updateSummary(format(msg.summary));
        }
        break;

      case "GPT_DONE": {
        stream.working = false;
        setStreamingIndicator(msgProfile, false);
        // Save to this profile's cache (uses msg.profile, not currentProfile)
        await saveSummary(stream.summary, msg.model, msgProfile, stream.thinking);
        await updateProfileCacheIndicator(msgProfile);

        if (isCurrent) {
          lastMessage = stream.summary;
          currentModelName = msg.model;
          // Refresh effort from the message's profile so the footer label is
          // consistent — the API response gives back the model but not the effort.
          const donePK = `profile__${msgProfile}`;
          const doneProfile = await chrome.storage.sync.get(donePK);
          currentEffort = doneProfile[donePK]?.thinkingEffort || "";
          showModelFooter();
        }
        stream.thinkingComplete = false;
        break;
      }

      case "GPT_ERROR":
        stream.working = false;
        setStreamingIndicator(msgProfile, false);
        if (isCurrent) {
          reportError(msg.error);
          hideModelFooter();
          clearThinking();
        }
        delete streams[msgProfile];
        break;

      default:
        if (isCurrent) reportError("Failed to fetch summary.");
        break;
    }
  }

  //----------------------------------------------------------------------------
  // Display error messages from the background script.
  //----------------------------------------------------------------------------
  function reportError(msg) {
    document.getElementById("errors").innerHTML = [
      `<div class="alert alert-danger alert-dismissible fadee" role="alert">`,
      `   <div>${msg}</div>`,
      '   <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>',
      "</div>",
    ].join("");
  }

  //----------------------------------------------------------------------------
  // Controlling the popup window size is a real pain in extensions. This
  // function attempts to set the window size to 'auto' on small screen
  // devices, like mobile browsers, where the popup is likely to have been
  // opened in a full screen tab (as is the case with Kiwi). On larger screens,
  // the popup is set to a fixed size of 600px x 600px.
  //----------------------------------------------------------------------------
  function setWindowSize() {
    if (isMobile) {
      document.body.style.width = "auto";
      document.body.style.height = "auto";
    } else {
      const width = Math.min(780, Math.round(screen.width * 0.6 * 0.1) * 10);
      const height = 900;
      document.body.style.width = `${width}px`;
      document.body.style.height = `${height}px`;
    }
  }

  setWindowSize();

  //----------------------------------------------------------------------------
  // Extracting text from PDF files
  //----------------------------------------------------------------------------
  pdfjsLib.GlobalWorkerOptions.workerSrc = "../assets/pdf.worker.mjs";

  async function extractTextFromPDF(url) {
    const pdf = await pdfjsLib.getDocument(url).promise;
    let content = "";

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const text = await page.getTextContent();
      content += text.items.map((item) => item.str).join(" ");
    }

    return content;
  }

  function isPDF(url) {
    return url.toLowerCase().endsWith(".pdf");
  }

  //----------------------------------------------------------------------------
  // Extracting text from anything supported
  //----------------------------------------------------------------------------
  async function getReferenceText() {
    const url = (await chrome.tabs.get(tabId)).url;

    if (isPDF(url)) {
      return extractTextFromPDF(url);
    } else {
      return new Promise((resolve, reject) => {
        chrome.scripting.executeScript(
          {
            target: { tabId },
            func: () => document.body.innerText,
          },
          (results) => {
            if (results === undefined || results.length === 0) {
              reject(
                "Unable to retrieve page contents or page contents are empty.",
              );
            }

            if (results[0].result === undefined || results[0].result === "") {
              reject(
                "Unable to retrieve page contents or page contents are empty.",
              );
            }

            resolve(results[0].result);
          },
        );
      });
    }
  }

  //----------------------------------------------------------------------------
  // Powers the button that opens the options page
  //----------------------------------------------------------------------------
  document.getElementById("options").addEventListener("click", function () {
    chrome.runtime.openOptionsPage();
  });

  //----------------------------------------------------------------------------
  // powers the profile dropdown
  //----------------------------------------------------------------------------
  const noProfilesMessage =
    "No profiles found. Use the gear icon above or right-click the extension " +
    'icon and select "Options" to create a profile.';

  let currentProfile = "";

  // Update profile button UI and event listeners
  async function loadProfiles() {
    const [{ defaultProfile, profiles }, { lastUsedProfile }] =
      await Promise.all([
        chrome.storage.sync.get(["defaultProfile", "profiles"]),
        chrome.storage.local.get(["lastUsedProfile"]),
      ]);

    if (!profiles) {
      reportError(noProfilesMessage);
      return;
    }

    const sortedProfiles = profiles.sort((a, b) => {
      if (a === defaultProfile) return -1;
      if (b === defaultProfile) return 1;
      return a.localeCompare(b);
    });

    // Clear existing buttons
    profileContainer.innerHTML = "";

    // Use for...of instead of forEach to properly handle async/await
    for (const profileName of sortedProfiles) {
      const button = document.createElement("button");
      button.className =
        "profile-button btn btn-sm btn-outline-secondary text-nowrap";

      // Check if this profile has cached data
      const hasCache = await hasCachedSummary(profileName);

      if (hasCache) {
        // Add green dot indicator for cached profiles
        const dot = document.createElement("span");
        dot.textContent = "● ";
        dot.style.color = "#28a745"; // Bootstrap success green
        dot.style.fontSize = "0.7em";
        dot.style.marginRight = "2px";
        button.appendChild(dot);
      }

      // Add profile name as text node
      button.appendChild(document.createTextNode(profileName));

      // Add click event listener for profile buttons
      button.addEventListener("click", async () => {
        await selectProfile(profileName);
      });

      profileContainer.appendChild(button);
    }

    // Automatically select a profile if necessary
    if (lastUsedProfile) {
      await selectProfile(lastUsedProfile);
    } else if (defaultProfile) {
      await selectProfile(defaultProfile);
    }
  }

  // Update the model and instructions when the profile changes
  async function selectProfile(selectedProfileName) {
    currentProfile = selectedProfileName;

    // Update the active profile button classes
    const buttons = profileContainer.getElementsByClassName("btn");

    for (const button of buttons) {
      // Check text content excluding dot
      const buttonText = button.textContent.replace(/^●\s*/, '').trim();

      if (buttonText === currentProfile) {
        button.className =
          "btn btn-sm m-1 text-nowrap btn-outline-primary active";
      } else {
        button.className = "btn btn-sm m-1 text-nowrap btn-outline-secondary";
      }
    }

    // Save the selected profile name locally
    await chrome.storage.local.set({ lastUsedProfile: selectedProfileName });

    // Check if this profile has an active stream in progress
    const stream = streams[selectedProfileName];

    if (stream && stream.working) {
      // Active stream — show its current state
      if (stream.thinking) {
        updateThinking(stream.thinking);
        if (stream.thinkingComplete) {
          collapseThinking();
        }
      } else {
        clearThinking();
      }

      if (stream.summary) {
        lastMessage = stream.summary;
        hideModelFooter();
        updateSummary(format(stream.summary));
      } else {
        await showModelWorking(selectedProfileName);
      }
    } else {
      // No active stream — check cache
      const cached = await restoreSummary();

      if (cached) {
        hideModelFooter();
        lastMessage = cached.summary;
        updateSummary(format(cached.summary));

        if (cached.thinking) {
          updateThinking(cached.thinking);
          collapseThinking();
        } else {
          clearThinking();
        }

        requestAnimationFrame(() => {
          window.scrollTo(0, 0);
        });
      } else {
        // No cache — start new summarization
        clearThinking();
        lastMessage = null;
        const newStream = getStream(selectedProfileName);
        newStream.working = true;
        newStream.summary = null;
        newStream.thinking = null;
        newStream.thinkingComplete = false;
        newStream.started = false;
        setStreamingIndicator(selectedProfileName, "waiting");
        await showModelWorking(selectedProfileName);
        requestNewSummary();
      }
    }
  }

  // Initial call to load profiles
  await loadProfiles();

  // Update profile when the selector changes
  //profileSelector.addEventListener('change', selectProfile);

  //----------------------------------------------------------------------------
  // Autoscroll to the bottom of the page when new content is added. If the
  // user scrolls up, disable autoscroll until they scroll back to the bottom.
  //----------------------------------------------------------------------------
  let autoScroll = false;

  window.addEventListener("scroll", () => {
    const { scrollHeight, scrollTop, clientHeight } = document.documentElement;
    autoScroll = Math.abs(scrollHeight - scrollTop - clientHeight) < 10;
  });

  function format(text) {
    if (text == null || text.length === 0) {
      return "";
    }

    return marked.marked(text);
  }

  async function restoreSummary() {
    const url = await getOriginalTabUrl();
    const config = await chrome.storage.local.get("results");

    if (!config.results) return null;

    // Look up by current profile
    const profileKey = `profile__${currentProfile}`;
    const profileCache = config.results[profileKey];

    if (!profileCache || !profileCache[url]) {
      return null;
    }

    const result = profileCache[url];

    // Return all cached data including thinking
    return {
      summary: result.summary,
      model: result.model,
      thinking: result.thinking || null,
      timestamp: result.timestamp || null
    };
  }

  async function hasCachedSummary(profileName) {
    const url = await getOriginalTabUrl();
    const config = await chrome.storage.local.get("results");

    if (!config.results) return false;

    const profileKey = `profile__${profileName}`;
    const profileCache = config.results[profileKey];

    return !!(profileCache && profileCache[url]);
  }

  function findProfileButton(profileName) {
    const buttons = profileContainer.getElementsByClassName("btn");
    for (const button of buttons) {
      const buttonText = button.textContent.replace(/^●\s*/, '').trim();
      if (buttonText === profileName) return button;
    }
    return null;
  }

  // state: "waiting" (grey), "streaming" (orange pulsing), or false (remove)
  function setStreamingIndicator(profileName, state) {
    const button = findProfileButton(profileName);
    if (!button) return;

    const existingDot = button.querySelector('.profile-dot-waiting, .profile-dot-streaming, span[style*="color"]');

    if (state) {
      if (existingDot) existingDot.remove();
      const dot = document.createElement("span");
      dot.textContent = "● ";
      dot.className = state === "streaming" ? "profile-dot-streaming" : "profile-dot-waiting";
      button.insertBefore(dot, button.firstChild);
    } else if (existingDot && (existingDot.classList.contains('profile-dot-streaming') || existingDot.classList.contains('profile-dot-waiting'))) {
      existingDot.remove();
    }
  }

  async function updateProfileCacheIndicator(profileName) {
    const buttons = profileContainer.getElementsByClassName("btn");

    for (const button of buttons) {
      // Find button by checking text content (excluding any existing dot)
      const buttonText = button.textContent.replace(/^●\s*/, '').trim();

      if (buttonText === profileName) {
        // Check if it already has a dot
        const hasDot = button.querySelector('span[style*="color"]');

        if (!hasDot) {
          // Add green dot
          const dot = document.createElement("span");
          dot.textContent = "● ";
          dot.style.color = "#28a745";
          dot.style.fontSize = "0.7em";
          dot.style.marginRight = "2px";
          button.insertBefore(dot, button.firstChild);
        }
        break;
      }
    }
  }

  async function saveSummary(summary, model, profileName, thinking) {
    const url = await getOriginalTabUrl();
    const config = await chrome.storage.local.get("results");

    let results = config.results || {};

    const profileKey = `profile__${profileName}`;
    if (!results[profileKey]) {
      results[profileKey] = {};
    }

    results[profileKey][url] = {
      model: model,
      summary: summary,
      thinking: thinking || null,
      timestamp: Date.now()
    };

    try {
      await chrome.storage.local.set({ results: results });
    } catch (e) {
      console.error("Failed to save summary to cache:", e);
    }
  }

  function updateSummary(message) {
    requestAnimationFrame(() => {
      document
        .getElementById("summaryCard")
        .classList.remove("visually-hidden");

      target.innerHTML = message;

      // Autoscroll to the bottom of the page
      if (autoScroll) {
        window.scrollTo(0, document.body.scrollHeight);
      }
    });
  }

  //----------------------------------------------------------------------------
  // Thinking mode functions
  //----------------------------------------------------------------------------
  function updateThinking(thinkingText) {
    requestAnimationFrame(() => {
      const thinkingSection = document.getElementById("thinkingSection");
      const thinkingContent = document.getElementById("thinkingContent");

      // Show the thinking section
      thinkingSection.classList.remove("visually-hidden");

      // Update the streaming content (formatted as markdown)
      thinkingContent.innerHTML = format(thinkingText);

      // Auto-scroll the thinking container to bottom to show latest thinking
      thinkingContent.scrollTop = thinkingContent.scrollHeight;

      // Autoscroll to the bottom of the page
      if (autoScroll) {
        window.scrollTo(0, document.body.scrollHeight);
      }
    });
  }

  function collapseThinking() {
    requestAnimationFrame(() => {
      const thinkingContent = document.getElementById("thinkingContent");
      const thinkingCollapsed = document.getElementById("thinkingCollapsed");
      const thinkingExpandedDiv = document.querySelector(
        "#thinkingExpanded .thinking-text-collapsed",
      );

      // Hide the streaming thinking content
      thinkingContent.classList.add("visually-hidden");

      // Copy the final thinking content to the collapsed view
      thinkingExpandedDiv.innerHTML = thinkingContent.innerHTML;

      // Show the collapsed toggle button
      thinkingCollapsed.classList.remove("visually-hidden");
    });
  }

  function clearThinking() {
    requestAnimationFrame(() => {
      const thinkingSection = document.getElementById("thinkingSection");
      const thinkingContent = document.getElementById("thinkingContent");
      const thinkingCollapsed = document.getElementById("thinkingCollapsed");

      thinkingSection.classList.add("visually-hidden");
      thinkingContent.innerHTML = "";
      thinkingContent.classList.remove("visually-hidden");
      thinkingCollapsed.classList.add("visually-hidden");
    });
  }

  function clearSummary() {
    requestAnimationFrame(() => {
      document.getElementById("summaryCard").classList.add("visually-hidden");
      target.innerHTML = "";
    });
    clearThinking();
  }

  async function requestNewSummary() {
    // Reset thinking state before new request
    const stream = getStream(currentProfile);
    stream.thinking = null;
    stream.thinkingComplete = false;
    clearThinking();

    const url = await getOriginalTabUrl();
    const content = await getReferenceText()
      .then((text) => {
        postMessage({
          action: "SUMMARIZE",
          profile: currentProfile,
          content: text,
          url: url,
        });
      })
      .catch((error) => {
        reportError(error);
        clearSummary();
        stream.working = false;
      });
  }
});
