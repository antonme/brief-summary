<div align="center">

<img src="assets/icon_full.png" width="112" height="112" alt="Page Summarizer icon" />

# Page Summarizer

**Summarize any web page or PDF with the LLM of your choice — right from your browser toolbar.**

![Manifest V3](https://img.shields.io/badge/Manifest-V3-4285F4)
![Chrome](https://img.shields.io/badge/Chrome-supported-success?logo=googlechrome&logoColor=white)
![Firefox](https://img.shields.io/badge/Firefox-supported-success?logo=firefox&logoColor=white)
![LLM providers](https://img.shields.io/badge/LLM%20providers-6-orange)

</div>

---

Page Summarizer is a Chrome / Firefox extension (Manifest V3) that turns the content of the current tab into a concise summary using the large language model you prefer. It streams the answer as it's generated, shows the model's reasoning when available, and lets you keep multiple configurable **profiles** so a single click can fan a page out to several models at once.

> Based on [sysread/page-summarizer](https://github.com/sysread/page-summarizer), substantially extended with multi-provider support, streaming reasoning, profiles, and per-page caching.

## Features

- **Six LLM providers, one UI** — OpenAI, Anthropic, Google, Perplexity, xAI, and OpenRouter, auto-routed by model id.
- **Live streaming** — summaries render token-by-token; no waiting for the whole response.
- **Visible thinking** — reasoning/“thinking” output is streamed and shown in a collapsible panel for models that support it (Claude, Gemini, GPT‑5.x, Grok).
- **Adjustable thinking effort** — per-profile control (off → max, or the provider's native levels) so you can trade speed for depth.
- **Built-in web search** — automatically enabled where the provider supports it: Perplexity Sonar, Google Search grounding, and xAI live search, with inline source citations.
- **Multiple profiles** — save different model + system prompt + custom prompt combinations, set a default, and switch instantly. Profiles can run concurrently.
- **Per-page, per-profile caching** — already-summarized pages load instantly; manage or clear the cache from the options page.
- **PDF support** — extracts and summarizes text from PDF tabs via PDF.js.
- **Editable model field** — pick from curated presets or type any model id the provider supports.
- **Import / export profiles** — back up or share your configuration as JSON.

## Supported providers & models

Routing is by model-id prefix, and the model field is editable — the lists below are the curated presets shipped in the options UI.

| Provider | Endpoint | Preset models | Highlights |
| --- | --- | --- | --- |
| **OpenAI** | Responses API | GPT‑5.6 Sol / Terra / Luna, GPT‑5.5, GPT‑5.5 Pro | Streamed reasoning summaries, pro reasoning mode, ultra (multi‑agent beta) |
| **Anthropic** | Messages API | Claude Fable 5, Claude Opus 4.8, Claude Sonnet 4.6 | Adaptive thinking + `effort` control |
| **Google** | Gemini API | Gemini 3.1 Pro, Gemini 3.5 Flash | `thinkingLevel` reasoning + Google Search grounding |
| **Perplexity** | Sonar | Sonar Pro, Sonar | Built-in web search with citations |
| **xAI** | Responses API | Grok 4.5, Grok 4.1 Fast (reasoning / non‑reasoning) | Live web search + citations |
| **OpenRouter** | Chat Completions | DeepSeek V4 Pro, Kimi K2.6, GLM‑5 Turbo, Qwen3.7‑Max | Access frontier open models through one key |

## Installation

### Chrome / Edge / Brave
1. Clone or download this repository.
2. Open `chrome://extensions`.
3. Enable **Developer mode** (top-right).
4. Click **Load unpacked** and select the repository folder.

### Firefox
```bash
web-ext build        # produces a zip in web-ext-artifacts/
```
Or load it temporarily: open `about:debugging` → **This Firefox** → **Load Temporary Add-on…** and select `manifest.json`.

## Configuration

Open the extension's **Options** page (right-click the toolbar icon → *Options*, or the gear in the popup) and:

1. **Add API keys** for the providers you want to use. Keys are stored in `chrome.storage.sync` and quick links to each provider's key page are built in:
   - [OpenAI](https://platform.openai.com/api-keys) · [Anthropic](https://console.anthropic.com/settings/keys) · [Perplexity](https://www.perplexity.ai/settings/api) · [Google AI Studio](https://aistudio.google.com/app/apikey) · [OpenRouter](https://openrouter.ai/keys) · [xAI](https://console.x.ai/)
2. **Create profiles** — each holds a model, system message, custom prompt, and thinking-effort level. Mark one as the default.
3. **Tune the custom prompt** (up to 8 KB) to shape the summary's format and tone.

You only need keys for the providers whose models you actually select.

## Thinking & effort

Each profile exposes a thinking-effort control whose options adapt to the selected model:

- **Claude** — `off* / low / medium / high / xhigh* / max*` mapped to adaptive thinking + `output_config.effort` (`xhigh` is Fable 5 / Opus 4.7/4.8, `max` is Fable/Opus-tier, `off` is unavailable on Fable 5 — its thinking can't be disabled).
- **GPT‑5.6** — `off / low / medium / high / xhigh / max` via `reasoning.effort`, plus **Pro mode** (`reasoning.mode: "pro"` — deeper single‑agent reasoning) and **Ultra** (the `multi_agent` Responses API beta: parallel subagents synthesized into one answer; reasoning summaries are unavailable in this mode, so no thinking panel).
- **Older GPT‑5.x** — `off / low / medium / high / xhigh` via the Responses API `reasoning.effort`.
- **Gemini 3.x** — `minimal / low / medium / high` via `thinkingLevel`.
- **Grok / Sonar** — provider defaults.

## Usage

1. Navigate to any article or PDF.
2. Click the Page Summarizer toolbar icon.
3. Pick a profile (or use your default) — the summary streams in, with reasoning shown above it when available.
4. Use the **copy** button to grab the summary, or switch profiles to compare models. Results are cached per page and profile.

## Architecture

The extension uses a message-passing architecture between a service-worker background script and the popup over named `chrome.runtime` ports.

| File | Role |
| --- | --- |
| `src/gpt.js` | Multi-provider API client with streaming; detects the provider from the model prefix and formats each request/response. |
| `src/page_summarizer.js` | Builds prompts from profile settings and delegates to the streamer. |
| `src/background.js` | Service worker wiring and feature initialization. |
| `src/pages/` | Popup and options (config) UI. |
| `src/compat.js` | Configuration migrations across schema versions. |

See [`CLAUDE.md`](CLAUDE.md) for a deeper architecture overview and contributor notes.

## Credits

Originally based on [sysread/page-summarizer](https://github.com/sysread/page-summarizer). Icon and multi-provider rework by [@antonme](https://github.com/antonme).
