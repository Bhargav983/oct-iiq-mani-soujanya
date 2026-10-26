# iOS WebView voice integration

The paired Expo wrapper now supplies native iOS speech recognition. `VoiceEngine` selects `NativeVoiceEngine` in the iOS app, so `useMicVAD` and the browser wake-word ONNX engine are not instantiated there. Existing web and Android providers remain in place.

## Behavior

- Composer microphone: native dictation inserts recognized text, without submitting a chat request.
- Waveform button: native recognition supplies final text to the existing authenticated assistant handler; existing Kokoro/Nabra response synthesis plays the reply, then recognition restarts for the next turn.
- “Enable Hey AIRA”: explicitly enables foreground, on-device English wake phrase matching. It pauses during dictation, conversation, and playback, resumes on exit, and turns off on logout/page reload.
- Conversation/dictation use Apple's speech recognition service (potentially network-backed), rather than the browser Whisper PCM WebSocket. Wake phrase recognition fails closed if the native exact-locale capability check is unavailable or unsupported. It is not a dedicated low-power wake-word model.

## Deployment

Deploy this web application to the URL loaded by the Expo wrapper (default `https://testcustomer.air2o.net/`). A fresh Expo development/TestFlight build is required for `expo-speech-recognition`, the local locale-capability module, and speech permission text. Neither local web changes at `localhost:3000` nor an OTA update can add these native modules to an older installed app.

The iOS voice control displays readiness/errors and lets the user enable or disable wake recognition. Development builds, or `?voiceDebug=1`, expose a small diagnostics expander. Native conversation requires authenticated user/company context and a non-public route.

## Checks

```sh
npm test -- --watchAll=false --runInBand --cacheDirectory=node_modules/.cache/jest-voice
npm run build
```

The cache path avoids Windows sandbox restrictions on Jest's temporary transform-cache renames. The repository's TypeScript 4.9 does not understand its existing `moduleResolution: bundler` setting or the installed Node 26 types; a TypeScript 5.9 compiler can check the source without changing the app's dependencies. CI builds also treat existing repository-wide lint/webpack warnings as failures.

The paired Expo project's `IOS-VOICE.md` contains the build commands and full physical-iPhone acceptance checklist. Device testing must verify permissions, dictation, repeated voice turns, wake sensitivity, interruptions, Bluetooth routing, and battery use. Automated bridge/lifecycle tests do not establish those hardware results.
