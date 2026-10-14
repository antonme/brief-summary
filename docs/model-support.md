# Model support audit — October 14, 2026

Version 3.1.0 refreshes the presets for the existing eight providers. Model IDs and capabilities were checked against official documentation and OpenRouter's public `/api/v1/models` catalog. This verifies the advertised API contract; access still depends on the account, key, region, billing plan, and provider availability.

| Provider | Request endpoint | Source |
| --- | --- | --- |
| OpenAI | `https://api.openai.com/v1/responses` | [Current models](https://developers.openai.com/api/docs/models), [GPT-6 migration](https://developers.openai.com/api/docs/guides/latest-model/gpt-6-astra) |
| Anthropic | `https://api.anthropic.com/v1/messages` | [Model IDs](https://platform.claude.com/docs/en/models/overview), [Thinking and effort](https://platform.claude.com/docs/en/build-with-claude/effort) |
| Google | `https://generativelanguage.googleapis.com/v1beta/models/{model}:streamGenerateContent?alt=sse` | [Model catalog](https://ai.google.dev/gemini-api/docs/models), [Argon GenerateContent guide](https://ai.google.dev/gemini-api/docs/generate-content/latest-model), [Thinking levels](https://ai.google.dev/gemini-api/docs/generate-content/thinking) |
| Perplexity | `https://api.perplexity.ai/v1/agent` | [Sonar migration](https://docs.perplexity.ai/docs/agent-api/migrate-from-sonar/how-to), [Presets](https://docs.perplexity.ai/docs/agent-api/presets) |
| xAI | `https://api.x.ai/v1/responses` | [Grok 4.7](https://docs.x.ai/developers/grok-4-7), [Retired aliases](https://docs.x.ai/developers/migration/may-15-retirement) |
| Moonshot | `https://api.moonshot.ai/v1/chat/completions` | [Kimi K3 and reasoning effort](https://platform.kimi.ai/docs/guide/kimi-k3-quickstart) |
| Alibaba | `https://token-plan.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1/chat/completions` | [Token Plan endpoint and models](https://www.alibabacloud.com/help/en/model-studio/qwen-code), [Chat parameters](https://www.alibabacloud.com/help/en/model-studio/qwen-api-via-openai-chat-completions) |
| OpenRouter | `https://openrouter.ai/api/v1/chat/completions` | [Live model catalog](https://openrouter.ai/api/v1/models) |

## Compatibility decisions

- Current OpenAI reasoning models use Responses. Astra and GPT-6.1 Sol reject `none`; saved off settings become low. Sol and Luna accept none. Legacy GPT-5.6 controls remain available to saved/custom profiles.
- Claude Fable 5.1 and Opus 5.5 require adaptive thinking. Sonnet 5.5 uses `between_tools` for no up-front thinking. Haiku 5.5 supports disabled thinking at low/medium/high. All current Claude presets expose low/medium/high/xhigh/max.
- Google’s GenerateContent streaming endpoint still supports Argon; switching to Interactions is unnecessary for ordinary summaries. Argon and 3.8 Flash reject minimal. Thinking summaries are separated from answers, and system guidance uses `systemInstruction`.
- Perplexity ended Sonar support on September 27, 2026. Saved `sonar` and `sonar-pro` map to fast; `sonar-reasoning` and `sonar-reasoning-pro` map to low; `sonar-deep-research` maps to high. New profiles can select all five Agent API presets.
- Kimi K3 supports low/high/max effort. It requires an open-platform key and always keeps thinking enabled.
- Qwen uses a dedicated Token Plan key. Thinking can be disabled; budget and effort parameters must not be sent together. The extension retains bounded budget controls.
- Retired Grok 4.1 Fast aliases are removed from the picker. Saved model IDs are preserved.
- The SSE parser preserves fragmented Unicode and rejects API errors, token-limit stops, and streams without a completion event. Failed/partial output is never emitted as `GPT_DONE` for caching.

## Live verification

OpenAI's authenticated model list returned `gpt-6.1-sol`, `gpt-6-astra`, `gpt-6-sol`, and `gpt-6-luna`. All four subsequently streamed the expected `API_OK` response through the extension's request builders and response parser.

Credentials for Anthropic, Google, Perplexity, xAI, Moonshot, Alibaba, and OpenRouter were unavailable in the shell during the initial audit. Their schemas and stream handling are covered by local tests; authenticated success has not been established for those providers. Re-run `npm run check:apis` with the corresponding environment variables to complete the live audit. Browser CORS and extension host permissions should also be checked in the target browser with its configured keys.

### Grok follow-up — October 14, 2026

The saved browser key was subsequently tested without exporting it. Grok 4.7 completed a simple live request in 13.5 seconds and the reported [Financial Times article](https://www.ft.com/content/60d09841-052a-44f3-a8ae-52c38fdbb5ab?syn-25a6b1a6=1) in 144.4 seconds with the saved Grok profile and cross-profile context. The article stream contained web-search activity and a long interval without visible reasoning summaries before the final answer.

Version 3.1.1 shows search progress, explicitly preserves the default high effort, recovers answer text from the completed response, and gives stalled requests a 900-second deadline. The live-check script uses the same deadline. This follows [xAI’s timeout guidance](https://docs.x.ai/developers/model-capabilities/text/best-practices). A lost background connection is now shown as an error instead of leaving the popup waiting. The stalled original run was not captured, so its precise failure is not established; the same input did complete in the instrumented reproduction.
