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

- **Eight LLM providers, one UI** — OpenAI, Anthropic, Google, Perplexity, xAI, Moonshot, Alibaba, and OpenRouter, auto-routed by model id.
- **Live streaming** — summaries render token-by-token; no waiting for the whole response.
- **Visible thinking** — reasoning/“thinking” output is streamed and shown in a collapsible panel for models that support it (Claude, Gemini, GPT‑6/GPT‑5.x, Grok).
- **Adjustable thinking effort** — per-profile control (off → max, or the provider's native levels) so you can trade speed for depth.
- **Built-in web search** — automatically enabled where the provider supports it: Perplexity Agent API, Google Search grounding, and xAI live search, with inline source citations.
- **Multiple profiles** — save different model + system prompt + custom prompt combinations, set a default, and switch instantly. Profiles can run concurrently.
- **Per-page, per-profile caching** — already-summarized pages load instantly; manage or clear the cache from the options page.
- **PDF support** — extracts and summarizes text from PDF tabs via PDF.js.
- **Editable model field** — pick from curated presets or type any model id the provider supports.
- **Import / export profiles** — back up or share your configuration as JSON.

## Supported providers & models

Routing is by model-id prefix, and the model field is editable — the lists below are the curated presets shipped in the options UI.

| Provider | Endpoint | Preset models | Highlights |
| --- | --- | --- | --- |
| **OpenAI** | Responses API | GPT‑6.1 Sol, GPT‑6 Astra, GPT‑6 Sol, GPT‑6 Luna | Streamed reasoning summaries and model-specific effort |
| **Anthropic** | Messages API | Claude Fable 5.1, Opus 5.5, Sonnet 5.5, Haiku 5.5 | Adaptive thinking and five effort levels |
| **Google** | GenerateContent streaming API | Gemini 4 Argon, 3.8 Flash, 3.6 Flash, 3.5 Flash-Lite, 3.1 Pro Preview | Thinking levels and Google Search grounding |
| **Perplexity** | Agent API | Fast, Low, Medium, High, Extra High presets | Current search/research configurations and streaming answers |
| **xAI** | Responses API | Grok 4.7, Grok 4.6 | Web search, citations, and reasoning effort |
| **Moonshot** | Chat Completions | Kimi K3 | Always-on thinking with low/high/max effort |
| **Qwen (Alibaba)** | Token Plan Chat Completions | Qwen3.8 Max, Max (0902), Flash | Optional thinking with a token budget |
| **OpenRouter** | Chat Completions | GPT‑6, Gemini 4/3.8, Grok 4.7, DeepSeek V4/V4.1, Kimi K3, GLM‑5.3, Qwen3.8, MiniMax M3, MiMo V2.5 Pro | One key for multiple providers |

The shared catalog in `src/models.js` contains 40 presets, verified on October 14, 2026. You can also enter a custom model ID. Existing saved model choices are preserved. Saved Sonar profiles use the current Perplexity Agent API with the provider's recommended preset mapping. See [provider sources and verification](docs/model-support.md).

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
   - [OpenAI](https://platform.openai.com/api-keys) · [Anthropic](https://console.anthropic.com/settings/keys) · [Perplexity](https://www.perplexity.ai/settings/api) · [Google AI Studio](https://aistudio.google.com/app/apikey) · [OpenRouter](https://openrouter.ai/keys) · [xAI](https://console.x.ai/) · [Moonshot](https://platform.moonshot.ai/console/api-keys) · [Alibaba Model Studio](https://modelstudio.console.alibabacloud.com/)
   - Note: Kimi K3 needs a Moonshot *open-platform* key (Kimi Code subscription keys won't work), and this extension’s Qwen integration needs a dedicated international Alibaba Token Plan key. Regular DashScope and Coding Plan keys use different endpoints.
2. **Create profiles** — each holds a model, system message, custom prompt, and thinking-effort level. Mark one as the default.
3. **Tune the custom prompt** (up to 8 KB) to shape the summary's format and tone.

You only need keys for the providers whose models you actually select.

## Thinking & effort

Each profile exposes a thinking-effort control whose options adapt to the selected model:

- **GPT‑6** — `low / medium / high / xhigh / max`. GPT‑6 Sol and Luna also support off (`none`); Astra and GPT‑6.1 Sol require reasoning. Saved off settings on those models become low.
- **Claude** — `low / medium / high / xhigh / max` on current models. Fable 5.1 and Opus 5.5 always think. Sonnet 5.5 offers “No up-front thinking” (`between_tools`); Haiku 5.5 can disable thinking at low effort.
- **Gemini** — model-specific thinking levels. Argon, 3.8 Flash, and 3.1 Pro offer low/medium/high; Flash-Lite and 3.6 Flash also offer minimal. Gemini 2.5 custom profiles retain token-budget controls.
- **Kimi K3** — `low / high / max`; thinking stays on.
- **Qwen 3.8** — off disables thinking; other settings choose a bounded thinking budget, displayed in tokens.
- **Grok 4.6/4.7** — `low / medium / high / xhigh`.
- **Perplexity** — select research depth through the model preset.
- **Legacy GPT‑5.6 profiles** retain their existing Pro/Ultra controls.

Dynamic uses provider defaults except Qwen, where the extension uses a bounded medium budget. Unsupported settings carried over from another model are normalized before sending a request.

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

## Verification

Run `npm test` for request/streaming regression tests. Run `npm run check:apis` for real streaming checks using provider keys in the environment; this may incur API charges. To check only specific models, use `npm run check:apis -- gpt-6.1-sol gpt-6-astra`.

The live checker exercises the extension’s actual client, reports missing credentials as skipped, and never writes browser settings or caches. Supported variables are `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY` (or `GOOGLE_API_KEY`), `PERPLEXITY_API_KEY`, `OPENROUTER_API_KEY`, `XAI_API_KEY`, `MOONSHOT_API_KEY` (or `KIMI_API_KEY`), and `QWEN_API_KEY` (or `BAILIAN_TOKEN_PLAN_API_KEY`). Fable calls have a minimum 20-minute timeout.
