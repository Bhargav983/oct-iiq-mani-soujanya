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
    await expect(service.start()).rejects.toThrow('bad model');
    expect(service.isActive).toBe(false);
    expect(onError).not.toHaveBeenCalled();
    expect(stop).toHaveBeenCalledTimes(1);
    await service.stop();
});

test('numeric WASM failure preserves its code and load stage', async () => {
    WakeWordEngine.mockImplementation(() => ({ on: jest.fn(), load: () => Promise.reject(16984200), stop: jest.fn() }));
    const service = new WakeWordService({ keywordPath: '/hey_aira.onnx', modelPath: '/models', onWakeWord: jest.fn() });
    await expect(service.start()).rejects.toMatchObject({ cause: 16984200, message: expect.stringContaining('loading wake models') });
    await service.stop();
});

test('permission errors keep NotAllowedError for gesture-only retries', async () => {
    const denied = new Error('permission denied'); denied.name = 'NotAllowedError';
    WakeWordEngine.mockImplementation(() => ({ on: jest.fn(), load: jest.fn(), start: () => Promise.reject(denied), stop: jest.fn() }));
    const service = new WakeWordService({ keywordPath: '/hey_aira.onnx', modelPath: '/models', onWakeWord: jest.fn() });
    await expect(service.start()).rejects.toMatchObject({ name: 'NotAllowedError', cause: denied });
});

test('repeated start/stop releases every inference session once per cycle', async () => {
    const releases = [];
    WakeWordEngine.mockImplementation(() => {
        const models = Array.from({ length: 4 }, () => ({ release: jest.fn() }));
        releases.push(...models.map(model => model.release));
        return { on: jest.fn(), load: jest.fn(), start: jest.fn(), stop: jest.fn(), _melspecModel: models[0], _embeddingModel: models[1], _vadModel: models[2], _keywordModels: { hey_aira: { session: models[3] } } };
    });
    const service = new WakeWordService({ keywordPath: '/hey_aira.onnx', modelPath: '/models', onWakeWord: jest.fn() });
    for (let cycle = 0; cycle < 10; cycle += 1) {
        await Promise.all([service.start(), service.start()]);
        expect(service.isActive).toBe(true);
        await Promise.all([service.stop(), service.stop()]);
        expect(service.isActive).toBe(false);
    }
    expect(releases).toHaveLength(40);
    releases.forEach(release => expect(release).toHaveBeenCalledTimes(1));
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
