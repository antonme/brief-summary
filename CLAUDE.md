# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Page Summarizer is a Chrome/Firefox browser extension (Manifest V3) that summarizes web pages using LLM APIs. It supports multiple providers: OpenAI (GPT models), Anthropic (Claude), Perplexity (Sonar), and Google (Gemini).

Based on: https://github.com/sysread/page-summarizer

## Development Commands

### Building and Testing
```bash
# Build extension for Firefox
web-ext build

```

### Installation
The extension can be installed in:
- **Chrome**: Load unpacked extension from the repo directory
- **Firefox**: load temporary add-on

## Architecture

### Core Flow

The extension uses a **message-passing architecture** between background scripts and content scripts via Chrome's `chrome.runtime.onConnect` API with named ports.

**Main Components:**

1. **background.js** - Service worker that initializes the page summarization feature:
   - `connectPageSummarizer()` - Main page summarization via popup

2. **gpt.js** - Core API abstraction layer that handles streaming completions from all supported LLM providers
   - Manages API endpoints and authentication for OpenAI, Anthropic, Perplexity, and Google
   - Implements streaming response readers that progressively send chunks via ports
   - Detects provider based on model prefix (`claude-*`, `sonar-*`, `gemini-*`, etc.)

3. **page_summarizer.js** - Constructs prompts from profile settings (system message + custom prompts + page content) and delegates to `fetchAndStream()`

4. **Profile System** - Multi-profile configuration stored in `chrome.storage.sync`:
   - Each profile has: `model`, `customPrompts`, `systemMessage`
   - Profiles stored as `profile__<name>` keys
   - Global API keys: `openAIKey`, `anthropicApiKey`, `perplexityApiKey`, `googleApiKey`

### Provider Detection Logic

Model prefixes determine which API to use:
- `gemini-*` → Google Gemini API
- `claude-*` → Anthropic API
- `sonar-*` → Perplexity API
- Everything else → OpenAI API

Each provider has different payload formats (see gpt.js:280-339).

### Message Flow for Summarization

1. User opens popup and clicks summarize button
2. Popup script connects to background via named port (`'summarize'`)
3. Port sends message with action type `SUMMARIZE`
4. Background calls `fetchAndStream(port, messages, model, profileName)`
5. API responses stream back through port messages:
   - `GPT_MESSAGE` - Incremental content updates
   - `GPT_DONE` - Final complete response
   - `GPT_ERROR` - Error occurred

### Configuration Migration (compat.js)

The extension has evolved through several config schema versions. On install/update, migration functions run:
- `updateConfigToUseProfiles_20231117()` - Migrated from single config to profile system
- `updateModelNaming_20240129()`, `updateModelNaming_20240423()` - Updated model names as OpenAI changed naming
- `updateProfileStructure_20240620()` - Changed profiles from object to array-based structure

When modifying config structure, add new migration functions to compat.js and call in background.js.

## Key Files

- **src/gpt.js** - Multi-provider API client with streaming (450+ lines, handles all LLM APIs)
- **src/pages/config.js** - Profile management UI (390+ lines)
- **src/background.js** - Extension initialization and feature wiring
- **src/compat.js** - Configuration migration system
- **manifest.json** - Extension manifest with permissions and host_permissions for API endpoints

## Important Notes

### API Key Storage
- Global API keys stored in `chrome.storage.sync` (synced across devices)
- Keys: `openAIKey`, `anthropicApiKey`, `perplexityApiKey`, `googleApiKey`
- Profile-specific API keys are NOT currently used (see gpt.js:349-357 - code references them but they're never set)

### Special Handling
- **o1 models**: System messages converted to user messages (gpt.js:319-326)
- **Google API**: Uses `x-goog-api-key` header instead of Bearer token
- **Anthropic API**: Requires `anthropic-dangerous-direct-browser-access: true` header for CORS

### Browser Compatibility
Uses `globalThis.browser = chrome` polyfill for Chrome compatibility (Firefox natively supports `browser` namespace).

### Custom Prompts
- Limited to 8192 bytes (enforced in config UI with binary search truncation)
- Displayed with byte counter that turns red at limit

## TODO Items

See the `TODO` file in the repository root for tracked future work.
