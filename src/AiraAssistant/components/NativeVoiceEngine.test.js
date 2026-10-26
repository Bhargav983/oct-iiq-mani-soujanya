import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { createRef } from 'react';
import { VoiceEngine } from './VoiceEngine';
import { useVoiceAssistant } from '../hooks/useVoiceAssistant';
import { playTTS } from '../services/ttsService';
import { useInlineDictation } from '../hooks/useInlineDictation';
jest.mock('../hooks/useVoiceAssistant', () => ({ useVoiceAssistant: jest.fn() }));
jest.mock('../services/ttsService', () => ({ playTTS: jest.fn(), ttsService: { stopCurrentAudio: jest.fn() } }));
let post;
function commands() {
    return post.mock.calls.map(([message]) => JSON.parse(message)).filter(message => message.type === 'AIRA_VOICE');
}
function event(id, data) {
    window.dispatchEvent(new CustomEvent('airaNativeVoice', { detail: { requestId: id, ...data } }));
}
function fixture(overrides = {}) {
    const ref = createRef();
    const props = { lang: 'en', onSnapshot: jest.fn(), onResult: jest.fn().mockResolvedValue('reply'), auth: { userId: 'u', companyId: 'c' }, currentPathname: '/chat-bot', ...overrides };
    const view = render(<VoiceEngine {...props} ref={ref}/>);
    return { ref, props, ...view };
}
beforeEach(() => {
    jest.clearAllMocks();
    post = jest.fn();
    Object.assign(window, { __AIRA_IOS_APP__: true, __AIRA_NATIVE_VOICE__: true, ReactNativeWebView: { postMessage: post } });
    playTTS.mockResolvedValue(undefined);
});
afterEach(() => {
    delete window.__AIRA_IOS_APP__;
    delete window.__AIRA_NATIVE_VOICE__;
    delete window.ReactNativeWebView;
});
test('iOS never mounts browser VAD and wake recognition is opt-in', () => {
    fixture();
    expect(useVoiceAssistant).not.toHaveBeenCalled();
    expect(commands()).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: 'Enable “Hey AIRA”' }));
    expect(commands().at(-1).mode).toBe('wake');
});
test('native final is submitted once after end, then the next conversation turn starts', async () => {
    const f = fixture({ isSessionActive: () => true });
    act(() => { void f.ref.current.start(); });
    const id = commands().at(-1).requestId;
    await act(async () => {
        event(id, { event: 'start' });
        event(id, { event: 'result', isFinal: true, results: [{ transcript: 'turn on cooling' }] });
        event(id, { event: 'result', isFinal: true, results: [{ transcript: 'turn on cooling' }] });
        expect(f.props.onResult).not.toHaveBeenCalled();
        event(id, { event: 'end' });
    });
    expect(f.props.onResult).toHaveBeenCalledTimes(1);
    expect(playTTS).toHaveBeenCalledTimes(1);
    expect(commands().filter(c => c.action === 'start')).toHaveLength(2);
});
test('cancel during response request prevents late playback and restart', async () => {
    let reply = () => { };
    const f = fixture({ onResult: jest.fn(() => new Promise(resolve => { reply = resolve; })), isSessionActive: () => true });
    act(() => { void f.ref.current.start(); });
    const id = commands().at(-1).requestId;
    act(() => {
        event(id, { event: 'result', isFinal: true, results: [{ transcript: 'hello' }] });
        event(id, { event: 'end' });
        f.ref.current.cancel();
    });
    await act(async () => { reply('late reply'); });
    expect(playTTS).not.toHaveBeenCalled();
    expect(commands().filter(c => c.action === 'start')).toHaveLength(1);
});
test('wake detection fires only once and releases native capture', () => {
    const wake = jest.fn();
    fixture({ onWakeWordDetected: wake });
    fireEvent.click(screen.getByRole('button', { name: 'Enable “Hey AIRA”' }));
    const id = commands().at(-1).requestId;
    act(() => {
        event(id, { event: 'result', results: [{ transcript: 'Hey Aira' }] });
        event(id, { event: 'result', results: [{ transcript: 'Hey Aira' }] });
    });
    expect(wake).toHaveBeenCalledTimes(1);
    expect(commands().at(-1).action).toBe('cancel');
});
test('logout cancels native capture and removes wake controls', () => {
    const f = fixture();
    act(() => { void f.ref.current.start(); });
    f.rerender(<VoiceEngine {...f.props} currentPathname="/login" auth={{ userId: '', companyId: '' }} ref={f.ref}/>);
    expect(commands().at(-1).action).toBe('cancel');
    expect(screen.queryByRole('button', { name: 'Enable “Hey AIRA”' })).toBeNull();
});
test('native dictation fills composer without calling the conversation handler', () => {
    const text = jest.fn();
    const { result } = renderHook(() => useInlineDictation('ar', text));
    act(() => { result.current.start(); });
    const command = commands().at(-1);
    expect(command.mode).toBe('dictation');
    expect(command.lang).toBe('ar-SA');
    act(() => {
        event(command.requestId, { event: 'result', isFinal: true, results: [{ transcript: 'مرحبا' }] });
        event(command.requestId, { event: 'end' });
    });
    expect(text).toHaveBeenCalledWith('مرحبا');
    expect(result.current.listening).toBe(false);
});

test('enabling wake recognition during response playback waits until playback ends', async () => {
    let finish;
    playTTS.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const f = fixture();
    act(() => { void f.ref.current.start(); });
    const id = commands().at(-1).requestId;
    await act(async () => {
        event(id, { event: 'result', isFinal: true, results: [{ transcript: 'hello' }] });
        event(id, { event: 'end' });
    });
    fireEvent.click(screen.getByRole('button', { name: 'Enable “Hey AIRA”' }));
    expect(commands().filter(c => c.action === 'start')).toHaveLength(1);
    await act(async () => { finish(); });
    expect(commands().at(-1).mode).toBe('wake');
});
