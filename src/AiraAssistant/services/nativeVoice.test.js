import { startNativeVoice } from './nativeVoice';
const nativeEvent = (requestId, event) => window.dispatchEvent(new CustomEvent('airaNativeVoice', { detail: { requestId, event } }));
let post;
beforeEach(() => {
    jest.useFakeTimers();
    post = jest.fn();
    window.ReactNativeWebView = { postMessage: post };
});
afterEach(() => { jest.useRealTimers(); delete window.ReactNativeWebView; });
test('ignores stale native results after cancellation', () => {
    const handler = jest.fn();
    const session = startNativeVoice('dictation', 'en-US', handler);
    const id = JSON.parse(post.mock.calls[0][0]).requestId;
    session.cancel();
    nativeEvent(id, 'result');
    expect(handler).not.toHaveBeenCalled();
    expect(JSON.parse(post.mock.calls[1][0]).action).toBe('cancel');
});
test('request listeners are isolated and removed on end', () => {
    const first = jest.fn(), second = jest.fn();
    const one = startNativeVoice('wake', 'en-US', first);
    const id1 = JSON.parse(post.mock.calls[0][0]).requestId;
    const two = startNativeVoice('conversation', 'en-US', second);
    const id2 = JSON.parse(post.mock.calls[1][0]).requestId;
    nativeEvent(id1, 'result');
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).not.toHaveBeenCalled();
    nativeEvent(id2, 'end');
    nativeEvent(id2, 'result');
    expect(second).toHaveBeenCalledTimes(1);
    one.cancel();
    two.cancel();
});
test('missing native response times out with an actionable failure', () => {
    const handler = jest.fn();
    startNativeVoice('dictation', 'en-US', handler);
    jest.advanceTimersByTime(20000);
    expect(handler.mock.calls.map(([event]) => event.event)).toEqual(['error', 'end']);
    expect(JSON.parse(post.mock.calls[1][0]).action).toBe('cancel');
});
