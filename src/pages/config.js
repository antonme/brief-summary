document.addEventListener('DOMContentLoaded', async () => {
  const maxPromptBytes = 8192;
  const customPromptsCounter = document.getElementById('customPromptsCounter');

  const status = document.getElementById('status');

  const profileSelector = document.getElementById('profileSelector');

  // Global options
  const apiKey = document.getElementById('apiKey');
  const debug = document.getElementById('debug');

  // Profile options
  const name = document.getElementById('name');
  const model = document.getElementById('model');
  const customPrompts = document.getElementById('customPrompts');
  const isDefault = document.getElementById('default');

  let config;
  let currentProfile;

  function updateCustomPromptsCounter() {
    const encoder = new TextEncoder();
    let byteCount = encoder.encode(customPrompts.value).length;

    if (byteCount > maxPromptBytes) {
      let low = 0;
      let high = customPrompts.value.length;
      let mid;
      while (low < high) {
        mid = Math.floor((low + high) / 2);
        byteCount = encoder.encode(customPrompts.value.substring(0, mid)).length;

        if (byteCount > maxPromptBytes) {
          high = mid;
        } else {
          low = mid + 1;
        }
      }

      customPrompts.value = customPrompts.value.substring(0, high - 1);
      byteCount = encoder.encode(customPrompts.value).length;
    }

    customPromptsCounter.textContent = `${byteCount}/${maxPromptBytes}`;

    // Update the color of the byte counter based on the byte count
    customPromptsCounter.classList.remove('text-danger');
    customPromptsCounter.classList.remove('text-muted');

    if (byteCount >= maxPromptBytes) {
      customPromptsCounter.classList.add('text-danger');
    } else {
      customPromptsCounter.classList.add('text-muted');
    }
  }

  function buildDefaultProfile() {
    return {
      model: 'claude-opus-4-8',
      customPrompts: '',
      systemMessage: ''
    };
  }

  function buildDefaultConfig() {
    return {
      openAIKey: '',
      anthropicApiKey: '',
      perplexityApiKey: '',
      googleApiKey: '',
      openRouterApiKey: '',
      xaiApiKey: '',
      moonshotApiKey: '',
      qwenApiKey: '',
      debug: false,
      defaultProfile: 'default',
      profiles: ['default'],
      profile__default: buildDefaultProfile(),
    };
  }

  async function saveConfig() {
    const debug = document.getElementById('debug').checked;
    const profileName = document.getElementById('name').value.trim();
    const model = document.getElementById('model').value.trim();
    const thinkingEffort = document.getElementById('thinkingEffort').value;
    const customPrompts = document.getElementById('customPrompts').value.trim();
    const systemMessage = document.getElementById('systemMessage').value.trim();
    const isDefault = document.getElementById('default').checked;
    
    // Save global API keys
    const globalConfig = {
      openAIKey: document.getElementById('openAIKey').value.trim(),
      anthropicApiKey: document.getElementById('anthropicApiKey').value.trim(),
      perplexityApiKey: document.getElementById('perplexityApiKey').value.trim(),
      googleApiKey: document.getElementById('googleApiKey').value.trim(),
      openRouterApiKey: document.getElementById('openRouterApiKey').value.trim(),
      xaiApiKey: document.getElementById('xaiApiKey').value.trim(),
      moonshotApiKey: document.getElementById('moonshotApiKey').value.trim(),
      qwenApiKey: document.getElementById('qwenApiKey').value.trim(),
      debug: debug
    };
    
    // Save global settings
    await chrome.storage.sync.set(globalConfig);

    // Create new profile data
    const newProfile = {
      model: model,
      thinkingEffort: thinkingEffort,
      customPrompts: customPrompts,
      systemMessage: systemMessage
    };

    // Update config object
    if (currentProfile && profileName !== currentProfile) {
      // Rename profile
      config.profiles = config.profiles.filter(p => p !== currentProfile);
      delete config[`profile__${currentProfile}`];
      config.profiles.push(profileName);
      config[`profile__${profileName}`] = newProfile;
      currentProfile = profileName;
    } else if (!currentProfile) {
      // New profile
      currentProfile = profileName;
      config.profiles.push(profileName);
      config[`profile__${profileName}`] = newProfile;
    } else {
      // Update existing profile
      config[`profile__${profileName}`] = newProfile;
    }

    if (isDefault) {
      config.defaultProfile = profileName;
    }

    // Save the profiles
    await chrome.storage.sync.set({
      profiles: config.profiles,
      defaultProfile: config.defaultProfile,
      [`profile__${profileName}`]: newProfile
    });

    await reloadConfig();
    await selectProfile(profileName);

    window.scrollTo(0, 0);
    showSuccess('Settings saved.');
  }

  async function deleteCurrentProfile() {
    if (currentProfile === config.defaultProfile) {
      showError('Cannot delete the default profile.');
      return;
    }

    if (confirm(`Are you sure you want to delete "${currentProfile}"? This cannot be undone.`)) {
      // remove from list of profile names
      config.profiles = config.profiles.filter((profile) => profile !== currentProfile);

      // remove individual profile's config
      delete config[`profile__${currentProfile}`];

      // remove from the ui
      profileSelector.remove(profileSelector.selectedIndex);

      // save the new config
      await chrome.storage.sync.set(config);

      showSuccess(`Profile "${currentProfile}" deleted.`);
      await selectProfile(config.defaultProfile);
    }
  }

  async function addNewProfile() {
    const name = prompt('Enter a name for the new profile');

    if (name in config.profiles) {
      showError(`Profile "${name}" already exists.`);
      return;
    }

    // Not an error - the user probably cancelled
    if (name == '' || name == null) {
      return;
    }

    config.profiles.push(name);
    config[`profile__${name}`] = buildDefaultProfile();
    await chrome.storage.sync.set(config);

    addOption(name);

    // omg this is stupid, why do i have to do this?
    profileSelector.value = name;
    const event = new Event('change', { bubbles: true });
    profileSelector.dispatchEvent(event);
  }

  async function reloadConfig() {
    const profileKeys = (await chrome.storage.sync.get('profiles')).profiles?.map((name) => `profile__${name}`) || [];
    config = await chrome.storage.sync.get([
      'openAIKey',
      'anthropicApiKey',
      'perplexityApiKey',
      'googleApiKey',
      'openRouterApiKey',
      'xaiApiKey',
      'moonshotApiKey',
      'qwenApiKey',
      'defaultProfile',
      'debug',
      'profiles',
      ...profileKeys
    ]);
    console.log('Config', config);

    if (config.profiles === undefined) {
      config = {
        ...config,
        profiles: ['default'],
        defaultProfile: 'default',
        [`profile__default`]: buildDefaultProfile()
      };
    }

    // Update state variables
    currentProfile = config.defaultProfile;

    // Update the form with global configs - using nullish coalescing for safety
    debug.checked = config.debug ?? false;
    document.getElementById('openAIKey').value = config.openAIKey ?? '';
    document.getElementById('anthropicApiKey').value = config.anthropicApiKey ?? '';
    document.getElementById('perplexityApiKey').value = config.perplexityApiKey ?? '';
    document.getElementById('googleApiKey').value = config.googleApiKey ?? '';
    document.getElementById('openRouterApiKey').value = config.openRouterApiKey ?? '';
    document.getElementById('xaiApiKey').value = config.xaiApiKey ?? '';
    document.getElementById('moonshotApiKey').value = config.moonshotApiKey ?? '';
    document.getElementById('qwenApiKey').value = config.qwenApiKey ?? '';

    // Load profiles into the dropdown and select the current profile.
    // Sort the profiles such that the default profile is always first.
    const sortedProfileNames = config.profiles.sort((a, b) => {
      if (a === config.defaultProfile) return -1;
      if (b === config.defaultProfile) return 1;
      return a.localeCompare(b);
    });

    // Clear the current options before we repopulate them
    profileSelector.innerHTML = '';

    // Populate the profile selector dropdown
    sortedProfileNames.forEach(addOption);

    await selectProfile(currentProfile);
  }

  function addOption(name) {
    const option = new Option(name, name);
    option.selected = name == currentProfile;
    profileSelector.add(option);
    return option;
  }

  // Update the form inputs with profile values
  function selectProfile(profile) {
    if (config.profiles.includes(profile)) {
      const data = config[`profile__${profile}`];
      console.log('Loading profile:', {
        name: profile,
        model: data.model,
        customPrompts: data.customPrompts,
        systemMessage: data.systemMessage
      });

      currentProfile = profile;
      document.getElementById('profileSelector').value = profile;
      document.getElementById('name').value = profile;
      document.getElementById('model').value = data.model || 'claude-opus-4-8';
      // Try to match the selector; if no match, it stays on whatever was selected
      const selector = document.getElementById('modelSelector');
      const hasOption = Array.from(selector.options).some(o => o.value === data.model);
      if (hasOption) selector.value = data.model;
      document.getElementById('thinkingEffort').value = data.thinkingEffort || 'dynamic';
      document.getElementById('customPrompts').value = data.customPrompts || '';
      document.getElementById('systemMessage').value = data.systemMessage || '';
      document.getElementById('default').checked = profile === config.defaultProfile;
      
      // Remove API key loading from profile selection
      updateCustomPromptsCounter();
      updateEffortControl();
      return;
    }

    showError(`Profile "${profile}" does not exist.`);
  }

  function showStatus(msg, type) {
    status.innerHTML = [
      `<div class="alert alert-${type} alert-dismissible fadee" role="alert">`,
      `   <div>${msg}</div>`,
      '   <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>',
      '</div>',
    ].join('');
  }

  function showError(msg) {
    showStatus(msg, 'danger');
  }

  function showSuccess(msg) {
    showStatus(msg, 'success');
  }

  // Per-provider option lists for the thinking-effort control.
  // Each provider has different supported values:
  //   - GPT-5.6 (sol/terra/luna): `reasoning.effort` accepts none|low|medium|high|xhigh|max;
  //     'pro' maps to `reasoning.mode: "pro"` and 'ultra' to the multi-agent
  //     beta (`multi_agent`) — both are 5.6-only Responses API features
  //   - Older GPT-5.x / o-series: `reasoning.effort` accepts none|low|medium|high|xhigh (no max)
  //   - Claude: `output_config.effort` accepts low|medium|high|max; Opus 4.7 adds xhigh;
  //     max is Opus-tier only; Haiku 4.5 errors on any effort value
  //   - Gemini: numeric `thinkingBudget` — labels show token counts
  //   - Kimi K3: thinking always-on, `reasoning_effort` accepts only "max" —
  //     nothing to choose, so no control is shown
  //   - Qwen 3.8: `thinking_budget` token budget — labels show the approximate
  //     budget (fractions of the 16k output cap, matching gpt.js)
  // Returns null for models that don't accept any effort/budget parameter.
  function getEffortOptions(modelId) {
    if (!modelId) return null;

    // Kimi K3: always-on thinking with a single accepted effort value —
    // showing a selector would be a lie, so hide the control entirely.
    if (modelId.startsWith('kimi-')) return null;

    if (modelId.startsWith('qwen')) {
      return [
        { value: 'off',     label: 'Minimal (~1.6k token budget)' },
        { value: 'low',     label: 'Low (~4k)' },
        { value: 'medium',  label: 'Medium (~6.5k)' },
        { value: 'high',    label: 'High (~10k)' },
        { value: 'xhigh',   label: 'Extra High (~13k)' },
        { value: 'dynamic', label: 'Dynamic (default: medium)' },
      ];
    }

    if (modelId.startsWith('gpt-5.6')) {
      return [
        { value: 'off',     label: 'Off (no reasoning)' },
        { value: 'low',     label: 'Low' },
        { value: 'medium',  label: 'Medium' },
        { value: 'high',    label: 'High' },
        { value: 'xhigh',   label: 'Extra High' },
        { value: 'max',     label: 'Max' },
        { value: 'pro',     label: 'Pro mode (deepest — no live stream, answer arrives at end)' },
        { value: 'ultra',   label: 'Ultra (multi-agent, beta — subagent work shown as thinking)' },
        { value: 'dynamic', label: 'Dynamic (default: medium)' },
      ];
    }

    if (modelId.startsWith('gpt-5') || /^o\d/.test(modelId)) {
      return [
        { value: 'off',     label: 'Off (no reasoning)' },
        { value: 'low',     label: 'Low' },
        { value: 'medium',  label: 'Medium' },
        { value: 'high',    label: 'High' },
        { value: 'xhigh',   label: 'Extra High' },
        { value: 'dynamic', label: 'Dynamic (default: medium)' },
      ];
    }

    if (modelId.startsWith('claude-')) {
      if (modelId.includes('haiku')) {
        // Haiku 4.5 errors on any effort value — only the off/adaptive endpoints work.
        return [
          { value: 'off',     label: 'Off' },
          { value: 'dynamic', label: 'Dynamic (adaptive)' },
        ];
      }
      // Fable 5: thinking is always on — an explicit `disabled` returns 400,
      // so there is no 'off'. Supports the full effort range incl. xhigh/max.
      const isFable = modelId.includes('fable');
      // `xhigh` is supported on Fable 5 and Opus 4.7/4.8 (not Sonnet/Haiku).
      // `max` is Fable/Opus-tier only.
      const supportsXhigh = isFable || modelId.includes('opus-4-7') || modelId.includes('opus-4-8');
      const supportsMax = isFable || modelId.includes('opus');
      const opts = [];
      if (!isFable) opts.push({ value: 'off', label: 'Off' });
      opts.push(
        { value: 'low',    label: 'Low' },
        { value: 'medium', label: 'Medium' },
        { value: 'high',   label: 'High' },
      );
      if (supportsXhigh) opts.push({ value: 'xhigh', label: 'Extra High' });
      if (supportsMax)   opts.push({ value: 'max',   label: 'Max' });
      opts.push({ value: 'dynamic', label: 'Dynamic (adaptive)' });
      return opts;
    }

    if (modelId.startsWith('gemini-')) {
      // Gemini 3.x uses `thinkingLevel` (minimal|low|medium|high) — no token
      // budget. Older Gemini 2.5 still uses the numeric `thinkingBudget`.
      if (modelId.startsWith('gemini-3')) {
        return [
          { value: 'off',     label: 'Minimal' },
          { value: 'low',     label: 'Low' },
          { value: 'medium',  label: 'Medium' },
          { value: 'high',    label: 'High' },
          { value: 'dynamic', label: 'Dynamic (model default)' },
        ];
      }
      // Legacy Gemini 2.5: `thinkingBudget` is a token count — show it in the label.
      return [
        { value: 'off',     label: 'Off' },
        { value: 'low',     label: 'Low (2k tokens)' },
        { value: 'medium',  label: 'Medium (10k tokens)' },
        { value: 'high',    label: 'High (32k tokens)' },
        { value: 'xhigh',   label: 'Extra High (60k tokens)' },
        { value: 'max',     label: 'Max (100k tokens)' },
        { value: 'dynamic', label: 'Dynamic (model decides)' },
      ];
    }

    return null;
  }

  function updateEffortControl() {
    const modelId = document.getElementById('model').value.trim();
    const container = document.getElementById('thinkingEffortContainer');
    const select = document.getElementById('thinkingEffort');
    const options = getEffortOptions(modelId);

    if (!options) {
      container.classList.add('d-none');
      return;
    }

    const previousValue = select.value;
    select.innerHTML = '';
    for (const opt of options) {
      select.appendChild(new Option(opt.label, opt.value));
    }
    // Preserve the user's selection if it's still available for this model;
    // otherwise fall back to dynamic so the displayed value is honest.
    select.value = options.some(o => o.value === previousValue) ? previousValue : 'dynamic';
    container.classList.remove('d-none');
  }

  // When model selector changes, populate the model text field
  document.getElementById('modelSelector').addEventListener('change', (e) => {
    document.getElementById('model').value = e.target.value;
    updateEffortControl();
  });

  // Direct edits to the freeform model id field also need to refresh the control
  document.getElementById('model').addEventListener('input', updateEffortControl);

  // Update form inputs when profile is changed
  profileSelector.addEventListener('change', (e) => {
    selectProfile(e.target.value);
  });

  // Handler to add new profile
  document.getElementById('add-profile-btn').addEventListener('click', async () => {
    await addNewProfile();
  });

  // Handler to delete the current profile
  document.getElementById('delete-profile-btn').addEventListener('click', async () => {
    await deleteCurrentProfile();
  });

  // Form submission handler
  document.getElementById('save-profile-btn').addEventListener('click', async (e) => {
    e.preventDefault();
    await saveConfig();
  });

  // Powers the button that opens the OpenAI API page
  document.getElementById('open-api-keys').addEventListener('click', function () {
    chrome.tabs.create({ url: 'https://platform.openai.com/api-keys' });
  });

  // Powers the button that opens the Anthropic API page
  document.getElementById('open-anthropic-keys').addEventListener('click', function () {
    chrome.tabs.create({ url: 'https://console.anthropic.com/settings/keys' });
  });

  // Powers the button that opens the Perplexity API page
  document.getElementById('open-perplexity-keys').addEventListener('click', function () {
    chrome.tabs.create({ url: 'https://www.perplexity.ai/settings/api' });
  });

  // Powers the button that opens the Google AI Studio API page
  document.getElementById('open-google-keys').addEventListener('click', function () {
    chrome.tabs.create({ url: 'https://aistudio.google.com/app/apikey' });
  });

  // Powers the button that opens the OpenRouter API page
  document.getElementById('open-openrouter-keys').addEventListener('click', function () {
    chrome.tabs.create({ url: 'https://openrouter.ai/keys' });
  });

  // Powers the button that opens the xAI API page
  document.getElementById('open-xai-keys').addEventListener('click', function () {
    chrome.tabs.create({ url: 'https://console.x.ai/' });
  });

  // Powers the button that opens the Moonshot open-platform API keys page
  document.getElementById('open-moonshot-keys').addEventListener('click', function () {
    chrome.tabs.create({ url: 'https://platform.moonshot.ai/console/api-keys' });
  });

  // Powers the button that opens the Alibaba Model Studio console (Qwen keys)
  document.getElementById('open-qwen-keys').addEventListener('click', function () {
    chrome.tabs.create({ url: 'https://modelstudio.console.alibabacloud.com/' });
  });

  // Powers the button that exports the current profile config
  document.getElementById('export-profiles-btn').addEventListener('click', function () {
    if (!config) {
      showStatus('No profiles to export.', 'danger');
      return;
    }

    const profiles = {};
    config.profiles.forEach((name) => {
      profiles[name] = config[`profile__${name}`];
    });

    if (Object.keys(profiles).length === 0) {
      showStatus('No profiles to export.', 'danger');
      return;
    }

    const configStr = JSON.stringify(profiles, null, 2);
    const blob = new Blob([configStr], { type: 'application/json' });

    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'PageSummarizeProfiles.json';

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    showSuccess('Profiles exported successfully.');
  });

  // Powers the button that imports the profile config file (part 1)
  document.getElementById('import-profiles-btn').addEventListener('click', function () {
    document.getElementById('import-profiles-file').click(); // Trigger file input
  });

  // Powers the button that imports the profile config file (part 2)
  document.getElementById('import-profiles-file').addEventListener('change', function (event) {
    const fileReader = new FileReader();

    // Once the file is read, import the profiles into the current config
    fileReader.onload = async function () {
      try {
        const importedProfiles = JSON.parse(fileReader.result);
        const importedProfileNames = Object.keys(importedProfiles);

        config.profiles = [...new Set([...config.profiles, ...importedProfileNames])];

        importedProfileNames.forEach((name) => {
          config[`profile__${name}`] = importedProfiles[name];
        });

        await chrome.storage.sync.set(config);
        await reloadConfig();

        showSuccess('Profiles imported successfully.');
      } catch (error) {
        showError('Failed to import profiles: ' + error.message);
      }
    };

    // Read the file, triggering the above callback
    const file = event.target.files[0];
    if (file) {
      fileReader.readAsText(file);
    }
  });

  // Powers the display of the custom prompts byte counter
  customPrompts.addEventListener('input', updateCustomPromptsCounter);

  //--------------------------------------------------------------------------
  // Cache management
  //--------------------------------------------------------------------------
  function formatBytes(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  async function updateCacheStats() {
    const data = await chrome.storage.local.get("results");
    const results = data.results || {};

    let entries = 0;
    for (const profileKey of Object.keys(results)) {
      entries += Object.keys(results[profileKey]).length;
    }

    const size = new Blob([JSON.stringify(results)]).size;

    document.getElementById('cache-entries').textContent = entries;
    document.getElementById('cache-size').textContent = formatBytes(size);
  }

  document.getElementById('clear-all-cache-btn').addEventListener('click', async () => {
    if (!confirm('Clear all cached summaries? This cannot be undone.')) return;
    await chrome.storage.local.remove("results");
    showSuccess('All cache cleared.');
    await updateCacheStats();
  });

  document.getElementById('clear-old-cache-btn').addEventListener('click', async () => {
    const data = await chrome.storage.local.get("results");
    const results = data.results || {};
    const oneWeekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    let removed = 0;

    for (const profileKey of Object.keys(results)) {
      const profileCache = results[profileKey];
      for (const url of Object.keys(profileCache)) {
        if (!profileCache[url].timestamp || profileCache[url].timestamp < oneWeekAgo) {
          delete profileCache[url];
          removed++;
        }
      }
      // Remove profile key if empty
      if (Object.keys(profileCache).length === 0) {
        delete results[profileKey];
      }
    }

    await chrome.storage.local.set({ results });
    showSuccess(`Removed ${removed} cached ${removed === 1 ? 'entry' : 'entries'} older than 1 week.`);
    await updateCacheStats();
  });

  // Load config on page load
  await reloadConfig();
  await updateCacheStats();
});
