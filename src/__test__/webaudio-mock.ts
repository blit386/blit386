/**
 * Lightweight Web Audio mock factories for unit and integration tests.
 * Mirrors the structure of `webgpu-mock.ts`: pure factory functions producing
 * stub objects that track calls without requiring a real audio device.
 */

/** Sample rate reported by a mock audio context, matching a typical browser default. */
const MOCK_SAMPLE_RATE = 48000;

/** Default gain value for a freshly created mock `AudioParam`, matching the real `GainNode` default. */
const DEFAULT_GAIN_VALUE = 1;

/** Recorded `AudioParam` scheduling calls, readable via a cast back from the returned `AudioParam`. */
export interface MockAudioParam {
    /** Current (immediately applied) parameter value. */
    value: number;

    /** Arguments recorded from every `setValueAtTime` call, in call order. */
    readonly setValueAtTimeCalls: Array<{ value: number; startTime: number }>;

    /** Arguments recorded from every `linearRampToValueAtTime` call, in call order. */
    readonly linearRampToValueAtTimeCalls: Array<{ value: number; endTime: number }>;

    /** Arguments recorded from every `setValueCurveAtTime` call, in call order. */
    readonly setValueCurveAtTimeCalls: Array<{ values: Float32Array; startTime: number; duration: number }>;

    /** `startTime` arguments recorded from every `cancelScheduledValues` call, in call order. */
    readonly cancelScheduledValuesCalls: number[];
}

/** Recorded `connect` calls, readable via a cast back from a mock `AudioNode`/`GainNode`. */
export interface MockAudioNode {
    /** Arguments recorded from every `connect` call, in call order. */
    readonly connectCalls: unknown[];
}

/** Recorded `GainNode` state: connect tracking plus the mock gain parameter. */
export interface MockGainNode extends MockAudioNode {
    /** Gain parameter with scheduling call tracking. */
    readonly gain: MockAudioParam;
}

/** Recorded `AudioContext` state: created gain nodes plus resume/close call counts. */
export interface MockAudioContext {
    /** Gain nodes created via `createGain()`, in call order. */
    readonly createGainCalls: readonly GainNode[];

    /** Buffer source nodes created via `createBufferSource()`, in call order. */
    readonly createBufferSourceCalls: readonly AudioBufferSourceNode[];

    /** Stereo panner nodes created via `createStereoPanner()`, in call order. */
    readonly createStereoPannerCalls: readonly StereoPannerNode[];

    /** Destination node passed to `main.connect(...)` in a well-wired bus graph. */
    readonly destination: AudioNode;

    /** Number of times `resume()` was called. */
    readonly resumeCallCount: number;

    /** Number of times `close()` was called. */
    readonly closeCallCount: number;

    /** `audioData` arguments recorded from every `decodeAudioData` call, in call order. */
    readonly decodeAudioDataCalls: ArrayBuffer[];

    /**
     * Behavior invoked by `decodeAudioData`. Reassign per test to resolve with a
     * custom buffer or reject with a decode error; defaults to resolving with a
     * {@link createMockAudioBuffer} stub.
     */
    decodeAudioDataImpl: (audioData: ArrayBuffer) => Promise<AudioBuffer>;
}

/**
 * Creates a mock `AudioParam` that applies every scheduling call immediately
 * (no real audio clock in tests) while recording call arguments.
 *
 * @param initialValue - Starting parameter value. Defaults to {@link DEFAULT_GAIN_VALUE}.
 * @returns Mock `AudioParam` stub, cast from a plain tracking object.
 */
export function createMockAudioParam(initialValue: number = DEFAULT_GAIN_VALUE): AudioParam {
    const setValueAtTimeCalls: Array<{ value: number; startTime: number }> = [];
    const linearRampToValueAtTimeCalls: Array<{ value: number; endTime: number }> = [];
    const setValueCurveAtTimeCalls: Array<{ values: Float32Array; startTime: number; duration: number }> = [];
    const cancelScheduledValuesCalls: number[] = [];

    const param = {
        value: initialValue,
        setValueAtTimeCalls,
        linearRampToValueAtTimeCalls,
        setValueCurveAtTimeCalls,
        cancelScheduledValuesCalls,
        setValueAtTime: (value: number, startTime: number) => {
            setValueAtTimeCalls.push({ value, startTime });
            param.value = value;

            return param;
        },
        linearRampToValueAtTime: (value: number, endTime: number) => {
            linearRampToValueAtTimeCalls.push({ value, endTime });
            param.value = value;

            return param;
        },
        setValueCurveAtTime: (values: Float32Array, startTime: number, duration: number) => {
            setValueCurveAtTimeCalls.push({ values, startTime, duration });
            param.value = values[values.length - 1] ?? param.value;

            return param;
        },
        cancelScheduledValues: (startTime: number) => {
            cancelScheduledValuesCalls.push(startTime);

            return param;
        },
    };

    return param as unknown as AudioParam;
}

/**
 * Creates a mock `GainNode`: a `connect`-tracking node with a mock
 * {@link createMockAudioParam} gain.
 *
 * @returns Mock `GainNode` stub, cast from a plain tracking object.
 */
export function createMockGainNode(): GainNode {
    const connectCalls: unknown[] = [];

    const node = {
        gain: createMockAudioParam(),
        connectCalls,
        connect: (destination: unknown) => {
            connectCalls.push(destination);

            return destination;
        },
        disconnect: () => {},
    };

    return node as unknown as GainNode;
}

/**
 * Creates a mock `AudioBufferSourceNode`: a `connect`-tracking, one-shot-`start`-enforcing node
 * with a mock {@link createMockAudioParam} `playbackRate` and a settable `onended` callback.
 *
 * @returns Mock `AudioBufferSourceNode` stub, cast from a plain tracking object.
 */
export function createMockAudioBufferSourceNode(): AudioBufferSourceNode {
    const connectCalls: unknown[] = [];
    const startCalls: number[] = [];
    const stopCalls: number[] = [];
    let hasStarted = false;

    const node = {
        buffer: null as AudioBuffer | null,
        loop: false,
        playbackRate: createMockAudioParam(1),
        onended: null as (() => void) | null,
        connectCalls,
        startCalls,
        stopCalls,
        connect: (destination: unknown) => {
            connectCalls.push(destination);

            return destination;
        },
        disconnect: () => {},
        start: (when: number = 0) => {
            if (hasStarted) {
                throw new Error('cannot start an AudioBufferSourceNode more than once');
            }

            hasStarted = true;
            startCalls.push(when);
        },
        stop: (when: number = 0) => {
            stopCalls.push(when);
        },
    };

    return node as unknown as AudioBufferSourceNode;
}

/**
 * Creates a mock `StereoPannerNode`: a `connect`-tracking node with a mock
 * {@link createMockAudioParam} `pan`.
 *
 * @returns Mock `StereoPannerNode` stub, cast from a plain tracking object.
 */
export function createMockStereoPannerNode(): StereoPannerNode {
    const connectCalls: unknown[] = [];

    const node = {
        pan: createMockAudioParam(0),
        connectCalls,
        connect: (destination: unknown) => {
            connectCalls.push(destination);

            return destination;
        },
        disconnect: () => {},
    };

    return node as unknown as StereoPannerNode;
}

/**
 * Creates a fake `AudioBuffer`-shaped object for {@link createMockAudioContext}'s
 * default `decodeAudioData` resolution.
 *
 * @returns Stub `AudioBuffer`, cast from a plain tracking object.
 */
export function createMockAudioBuffer(): AudioBuffer {
    return {
        sampleRate: MOCK_SAMPLE_RATE,
        length: 0,
        duration: 0,
        numberOfChannels: 1,
        getChannelData: () => new Float32Array(0),
        copyFromChannel: () => {},
        copyToChannel: () => {},
    } as unknown as AudioBuffer;
}

/**
 * Creates a mock `AudioContext` whose `createGain()` returns
 * {@link createMockGainNode} stubs, whose `resume()`/`close()` resolve
 * immediately while recording call counts, and whose `decodeAudioData()`
 * resolves with a {@link createMockAudioBuffer} stub by default.
 *
 * @returns Mock `AudioContext` stub, cast from a plain tracking object.
 */
export function createMockAudioContext(): AudioContext {
    const createGainCalls: GainNode[] = [];
    const createBufferSourceCalls: AudioBufferSourceNode[] = [];
    const createStereoPannerCalls: StereoPannerNode[] = [];
    const destination = {} as unknown as AudioNode;
    const decodeAudioDataCalls: ArrayBuffer[] = [];
    let resumeCallCount = 0;
    let closeCallCount = 0;

    const context = {
        currentTime: 0,
        sampleRate: MOCK_SAMPLE_RATE,
        state: 'suspended' as AudioContextState,
        destination,
        createGainCalls,
        createBufferSourceCalls,
        createStereoPannerCalls,
        decodeAudioDataCalls,
        decodeAudioDataImpl: (_audioData: ArrayBuffer) => Promise.resolve(createMockAudioBuffer()),
        get resumeCallCount() {
            return resumeCallCount;
        },
        get closeCallCount() {
            return closeCallCount;
        },
        createGain: () => {
            const node = createMockGainNode();

            createGainCalls.push(node);

            return node;
        },
        createBufferSource: () => {
            const node = createMockAudioBufferSourceNode();

            createBufferSourceCalls.push(node);

            return node;
        },
        createStereoPanner: () => {
            const node = createMockStereoPannerNode();

            createStereoPannerCalls.push(node);

            return node;
        },
        resume: () => {
            resumeCallCount += 1;
            context.state = 'running';

            return Promise.resolve();
        },
        close: () => {
            closeCallCount += 1;
            context.state = 'closed';

            return Promise.resolve();
        },
        decodeAudioData: (audioData: ArrayBuffer) => {
            decodeAudioDataCalls.push(audioData);

            return context.decodeAudioDataImpl(audioData);
        },
    };

    return context as unknown as AudioContext;
}

/**
 * Installs a mock `AudioContext` constructor on `globalThis`, since Node.js
 * and happy-dom provide no Web Audio APIs. Tracks every constructed instance
 * so tests can retrieve the context an attached subsystem actually created.
 *
 * @returns Accessor for the most recently constructed mock `AudioContext`.
 */
export function installMockAudioContext(): { getLastInstance: () => AudioContext | null } {
    let lastInstance: AudioContext | null = null;

    function MockAudioContextCtor(): AudioContext {
        const instance = createMockAudioContext();

        lastInstance = instance;

        return instance;
    }

    Object.defineProperty(globalThis, 'AudioContext', {
        value: MockAudioContextCtor,
        writable: true,
        configurable: true,
    });

    return {
        getLastInstance: () => lastInstance,
    };
}

/**
 * Removes the mock `AudioContext` constructor from `globalThis`.
 * Call in afterEach/afterAll to clean up.
 */
export function uninstallMockAudioContext(): void {
    if ('AudioContext' in globalThis) {
        delete (globalThis as unknown as Record<string, unknown>).AudioContext;
    }
}
