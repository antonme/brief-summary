# Native Kimi K3 + Qwen3.8-Max provider support

Date: 2026-07-23
Status: approved (user: "Go")

## Goal

Add Moonshot (Kimi K3) and Alibaba Qwen (Qwen3.8-Max) as first-class native
providers, alongside the existing OpenAI / Anthropic / Google / Perplexity /
xAI / OpenRouter tiers. The existing OpenRouter-routed Kimi K2.6 and
Qwen3.7-Max presets are unrelated and stay untouched.

Endpoint/auth/reasoning facts are sourced from the sibling project
`../multipoly` (`scripts/lib/models.mjs`, `reasoning.mjs`, `client.mjs`),
which already talks to both providers in production.

## Provider facts (from multipoly)

| | Kimi K3 (Moonshot) | Qwen3.8-Max (Alibaba) |
| --- | --- | --- |
| Endpoint | `https://api.moonshot.ai/v1/chat/completions` | `https://token-plan.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1/chat/completions` |
| Model id | `kimi-k3` | `qwen3.8-max-preview` (Token-Plan-only preview) |
| Auth | `Authorization: Bearer` — open-platform key; Kimi Code subscription keys do NOT work | `Authorization: Bearer` — Alibaba Code/Token-Plan key |
| Reasoning | Always-on; top-level `reasoning_effort` accepts only `"max"`; cannot be disabled | `enable_thinking: true` + `thinking_budget` (tokens); fractions of the token cap: off 10% / low 25% / medium 40% / high 60% / xhigh 80%, floor 256 |
| Streaming | OpenAI-compatible SSE; reasoning on `choices[0].delta.reasoning_content`, answer on `delta.content` | same |

## Design

1. **Provider detection** (`src/gpt.js`): model prefix `kimi-` → Moonshot,
   `qwen` → native Qwen. No clash with OpenRouter entries (they start with
   `openrouter/`).
2. **API keys**: new global `chrome.storage.sync` keys `moonshotApiKey` and
   `qwenApiKey`, with config-page inputs + "open key console" buttons,
   following the xAI/OpenRouter pattern exactly.
3. **Payloads**: Chat Completions shape (`{model, messages, stream: true}`):
   - Kimi: `reasoning_effort: "max"` always; no effort selector in the UI
     (only accepted value, thinking cannot be disabled). `max_tokens: 32768`
     to bound always-on reasoning + output.
   - Qwen: `max_tokens: 16384`, `enable_thinking: true`, `thinking_budget` =
     multipoly's effort fractions of the cap. Effort selector shows
     off/low/medium/high/xhigh/dynamic with approximate budgets.
4. **Streaming** (`src/gpt.js` stream loop): one shared branch for both
   providers routing `delta.reasoning_content` → thinking panel and
   `delta.content` → summary, mirroring the Anthropic/Gemini pattern
   (thinking collapses when the first answer token arrives — existing popup
   behavior, no popup changes).
5. **Plumbing**: `manifest.json` host_permissions for both endpoints; two new
   optgroups in the model dropdown (`kimi-k3`, `qwen3.8-max-preview`); README
   provider table / keys / effort-docs updates.

## Out of scope

- OpenRouter branch reasoning display (`delta.reasoning`) — separate concern.
- compat.js migrations — nothing to migrate; these are new providers.

## Open item

Key-console URLs are not recorded in multipoly; using
`https://platform.moonshot.ai/console/api-keys` and
`https://modelstudio.console.alibabacloud.com` — correct later if wrong.
