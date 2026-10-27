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
