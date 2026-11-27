# AiraAssistant Gemini voice gateway

AiraAssistant now sends speech requests to a same-origin server gateway. The gateway must call Gemini using a server-side API key; do not put a Gemini key in a `REACT_APP_*` variable because Create React App embeds those values in downloadable JavaScript.

Configure these frontend endpoint overrides in the React app's project-root `.env.production` before creating the production build (Create React App does not load `src/.env`):

```dotenv
REACT_APP_GEMINI_STT_URL=https://testcustomer.air2o.net/api/aira-voice/stt
REACT_APP_GEMINI_TTS_URL=https://testcustomer.air2o.net/api/aira-voice/tts/stream
```

These URLs are public frontend configuration. Never put the Gemini API key in a `REACT_APP_*` variable. Rebuild and redeploy the frontend after changing them; React embeds these values at build time.

For local development, `.env.development` points the app at the same-origin `/api/aira-voice` paths, and `src/setupProxy.js` forwards only those paths to `testcustomer.air2o.net`. This avoids requiring the gateway to allow localhost through CORS. The production build uses the absolute endpoint URLs above.

## Speech to text

STT is a real-time stream, not a batch upload. The browser opens a WebSocket to the STT endpoint (same origin in dev, `REACT_APP_GEMINI_STT_URL` in production) and streams raw binary PCM16 frames — 16 kHz, mono, little-endian, one `Int16Array` buffer per VAD frame — directly on the socket. No base64, no WAV container, no per-utterance JSON body.

The gateway relays those frames into a Gemini Live transcription session (`GEMINI_STT_MODEL=gemini-3.5-transcribe-live`, via the official `@google/genai` SDK's live `connect`) and streams transcript messages back over the same socket as JSON:

```json
{ "transcript": "partial hypothesis", "is_final": false }
{ "transcript": "finalized turn", "is_final": true, "confidence": 0.98 }
```

Contract details:

- Interim hypotheses and finalized turns both arrive as messages on the socket; `is_final` (or `isFinal`) marks the turn boundary. The browser keeps the longest hypothesis within the active turn, locks the final text in, and immediately resets for the next turn.
- **Turn isolation (`turn_reset`):** Between turns on a persistent WebSocket, the browser sends `{ "type": "turn_reset", "turnId": <number> }`. The gateway MUST clear per-connection transcript and PCM audio buffers immediately after emitting `is_final: true` AND whenever a `turn_reset` frame arrives, without closing the persistent client WebSocket. It must never re-send or prepend prior turns' audio or text.
- **HVAC vocabulary bias hint:** Configure the Gemini Live STT session system instruction / prompt hint with domain terminology (`machine, HVAC, chiller, thermostat, AIR2O, online, offline, anomaly`) so `"machine"` is not transcribed as `"mission"`.
- The selected language rides on the connect URL as a `?language=<lang>` query parameter; identity (user/company) is validated from the application session by the gateway, not from the wire.
- The Gemini API key stays server-side; nothing Google-specific reaches the browser.
- Gemini Live sessions are capped at ~10 minutes. The gateway must rotate the session (reconnect and replay any in-flight audio) before the cap, so the browser socket can stay open across rotations.
- The browser queues VAD frames captured before the socket opens and flushes them on open, and auto-reconnects with backoff if the socket drops mid-session; a reconnect re-streams fresh audio, so the gateway should treat each connection as a new utterance stream.

## Text to speech

The browser posts JSON containing `text`, detected `language` (`en`, `hi`, or `ar`), `user_id`, and `company_id` to `/api/aira-voice/tts/stream`. Keep the voice selection and Gemini key in the gateway configuration.

The response is **headerless raw Linear PCM** — `Content-Type: audio/l16;rate=24000;channels=1`, 24,000 Hz, 16-bit signed little-endian, mono — sent as `Transfer-Encoding: chunked` with no `Content-Length`. There is no `RIFF`/`fmt`/`data` container, so the browser must not use `decodeAudioData()`; it converts each `Int16` sample to `Float32` (`sample / 32768`) itself. The gateway already strips Markdown and splits text above 4,000 characters, streaming every part over one continuous response body.

The browser consumes the body progressively with `response.body.getReader()` and schedules blocks on a Web Audio graph created at 24,000 Hz, so playback begins as soon as the jitter buffer fills instead of after the whole reply synthesizes. Blocks chain on a running `nextStartTime` cursor. Because a network chunk can end mid-sample, the reader keeps a 16-bit-aligned carry byte — decoding an odd-length block would pair each byte with the wrong neighbour and turn the rest of the reply into noise.

The microphone, local VAD, pre-roll buffer, wake-word listener, playback controls, and conversation state remain in AiraAssistant. This repository contains the frontend contract only; the server routes must be deployed before voice requests can complete.
