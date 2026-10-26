import { WakeWordService } from './wakeWordService';
import { WakeWordEngine } from 'openwakeword-wasm-browser';
jest.mock('openwakeword-wasm-browser', () => ({ WakeWordEngine: jest.fn() }));
jest.mock('onnxruntime-web', () => ({ env: { wasm: {} } }));
test('model load failure settles instead of deadlocking inside stop', async () => {
    const stop = jest.fn().mockResolvedValue(undefined);
    WakeWordEngine.mockImplementation(() => ({
        on: jest.fn(), load: jest.fn().mockRejectedValue(new Error('bad model')), stop,
    }));
    const onError = jest.fn();
    const service = new WakeWordService({ keywordPath: '/hey_aira.onnx', modelPath: '/models', onWakeWord: jest.fn(), onError });
    await service.start();
    expect(service.isActive).toBe(false);
    expect(onError).toHaveBeenCalled();
    expect(stop).toHaveBeenCalledTimes(1);
    await service.stop();
});
test('cancellation during loading releases the partially initialized engine', async () => {
    let resolveLoad = () => { };
    const stop = jest.fn().mockResolvedValue(undefined), start = jest.fn();
    WakeWordEngine.mockImplementation(() => ({
        on: jest.fn(), load: () => new Promise(resolve => { resolveLoad = resolve; }), stop, start,
    }));
    const service = new WakeWordService({ keywordPath: '/hey_aira.onnx', modelPath: '/models', onWakeWord: jest.fn() });
    const loading = service.start();
    const stopping = service.stop();
    resolveLoad();
    await Promise.all([loading, stopping]);
    expect(start).not.toHaveBeenCalled();
    expect(stop).toHaveBeenCalledTimes(1);
});
