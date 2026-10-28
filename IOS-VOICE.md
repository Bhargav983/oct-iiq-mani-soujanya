# iOS WebView voice integration

The paired Expo wrapper now supplies native iOS speech recognition. `VoiceEngine` selects `NativeVoiceEngine` in the iOS app, so `useMicVAD` and the browser wake-word ONNX engine are not instantiated there. Existing web and Android providers remain in place.

## Behavior

- Composer microphone: native dictation inserts recognized text, without submitting a chat request.
- Waveform button: native recognition supplies final text to the existing authenticated assistant handler; existing Kokoro/Nabra response synthesis plays the reply, then recognition restarts for the next turn.
- “Hey AIRA” automatically arms after login once the native bridge is ready and the app is visible. It pauses during dictation, conversation, and playback, resumes on exit/foregrounding, and stops on logout. There is no Enable button or normal status panel. First-use iOS permission prompts remain required.
- Conversation/dictation use Apple's speech recognition service (potentially network-backed), rather than the browser Whisper PCM WebSocket. Wake phrase recognition fails closed if the native exact-locale capability check is unavailable or unsupported. It is not a dedicated low-power wake-word model.

## Deployment

Deploy this web application to the URL loaded by the Expo wrapper (default `https://testcustomer.air2o.net/`). A fresh Expo development/TestFlight build is required for `expo-speech-recognition`, the local locale-capability module, and speech permission text. Neither local web changes at `localhost:3000` nor an OTA update can add these native modules to an older installed app.

Development builds, or `?voiceDebug=1`, expose a diagnostics expander only. Normal wake recognition renders no panel; errors appear within the chat page. Native conversation requires authenticated user/company context and a non-public route.

## Checks

```sh
npm test -- --watchAll=false --runInBand --cacheDirectory=node_modules/.cache/jest-voice
npm run build
```

The cache path avoids Windows sandbox restrictions on Jest's temporary transform-cache renames. The repository's TypeScript 4.9 does not understand its existing `moduleResolution: bundler` setting or the installed Node 26 types; a TypeScript 5.9 compiler can check the source without changing the app's dependencies. CI builds also treat existing repository-wide lint/webpack warnings as failures.

The paired Expo project's `IOS-VOICE.md` contains the build commands and full physical-iPhone acceptance checklist. Device testing must verify permissions, dictation, repeated voice turns, wake sensitivity, interruptions, Bluetooth routing, and battery use. Automated bridge/lifecycle tests do not establish those hardware results.

## Automatic wake update (2026-10-27)

The already-tested native binary needs no module changes for this update. Deploy the changed web build, then reload the app. Older binaries without the native speech modules still need a new native build.

Browser VAD and wake inference now share exactly ONNX Runtime 1.23.2. Run `npm ci` to remove installed-version drift, then `npm run build`. `prestart`/`prebuild` generate and verify content-hashed JS/WASM, VAD, worklet, and wake assets. Generated `public/voice-assets/` is ignored in Git but must be deployed as part of the complete build directory. Do not copy only the JavaScript bundles. Preserve old asset revisions during rolling deployments until old clients refresh.

Commands: `npm run voice:check`, `npm run voice:smoke`, and `node --test scripts/voice-assets.test.cjs`. The smoke test runs all four wake models and conversation VAD with synthetic silence across three cycles; it does not measure wake recognition accuracy.

`/wakeword_test.html` uses the same local runtime/models for browser diagnosis, with model/inference testing and optional manual microphone testing. Serve `.js`/`.mjs` as JavaScript and `.wasm` as application/wasm; asset URLs must return the actual binary rather than the SPA HTML fallback. This page sends no audio to the chat backend.

## Android/browser microphone handoff (2026-10-28)

This change is web-only. No Expo/iOS source or separate Android project was changed. Runtime selection distinguishes iOS WebView (existing native bridge), Android WebView (coordinated browser capture plus Android release/retry handling), and ordinary browsers (coordinated browser capture). Explicit bridge flags are preferred when present; Android WebView user agents and the React Native WebView bridge are supported as fallbacks. Microphone and dictation API capabilities are checked separately.

A single browser microphone coordinator serializes wake, conversation, and dictation ownership. Conversation waits for wake capture cleanup. Dictation waits for previous capture cleanup, retains ownership after stop(), and releases only on the recognizer end event. Conversation awaits VAD pause and stops tracked audio tracks before wake re-arms. VAD initial capture and resume both use the coordinator-aware microphone helper. The conversation lease remains held during response synthesis/playback so the assistant cannot wake itself. Cancelled async responses cannot start stale playback or capture.

When a recognizer fails to signal end during cancellation, a five-second timeout reports failure without granting a second microphone owner. Android handoffs allow a short device-release delay. Android NotReadableError capture startup retries are bounded to three attempts (initial + 200ms/500ms retries). Permission and ONNX/model errors are not retried. Wake startup/inference ownership cleanup notifies the hook so it can re-arm after dictation rather than retaining a stale service reference.

Deploy the complete web build and reload both apps. No new native binary is required for these web microphone-handoff changes. A missing native Android permission or absent browser SpeechRecognition API cannot be fixed through device detection; unsupported dictation remains unavailable rather than claiming native support that the APK does not expose.

Automated coverage includes a ten-cycle wake/dictation/wake integration test, manual conversation waiting for wake shutdown, delayed VAD shutdown, stale responses/results, late microphone grants, Android retry limits, runtime selection, and the existing iOS native voice tests. Test the real APK after deployment: ten dictation cycles, ten manual conversation cycles, rapid stop/start, exit during response playback, background/foreground, logout, and permission denial/recovery. Hardware release timing still needs verification on the failing Android device.
