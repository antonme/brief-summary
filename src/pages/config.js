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
      model: 'gpt-4o-mini',
      customPrompts: '',
      systemMessage: ''
    };
  }

  function buildDefaultConfig() {
    return {
      openAIKey: '',
      anthropicApiKey: '',
      perplexityApiKey: '',
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
    const customPrompts = document.getElementById('customPrompts').value.trim();
    const systemMessage = document.getElementById('systemMessage').value.trim();
    const isDefault = document.getElementById('default').checked;
    
    // Save global API keys
    const globalConfig = {
      openAIKey: document.getElementById('openAIKey').value.trim(),
      anthropicApiKey: document.getElementById('anthropicApiKey').value.trim(),
      perplexityApiKey: document.getElementById('perplexityApiKey').value.trim(),
      debug: debug
    };
    
    // Save global settings
    await chrome.storage.sync.set(globalConfig);

    // Create new profile data
    const newProfile = {
      model: model,
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
      document.getElementById('model').value = data.model || 'gpt-4o-mini';
      document.getElementById('customPrompts').value = data.customPrompts || '';
      document.getElementById('systemMessage').value = data.systemMessage || '';
      document.getElementById('default').checked = profile === config.defaultProfile;
      
      // Remove API key loading from profile selection
      updateCustomPromptsCounter();
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

  // Load config on page load
  await reloadConfig();
});
