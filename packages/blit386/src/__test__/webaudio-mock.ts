/**
 * Lightweight Web Audio mock factories for unit and integration tests.
 * Mirrors the structure of `webgpu-mock.ts`: pure factory functions producing
 * stub objects that track calls without requiring a real audio device.
 */

/** Sample rate reported by a mock audio context, matching a typical browser default. */
const MOCK_SAMPLE_RATE = 48000;

/** Default gain value for a freshly created mock `AudioParam`, matching the real `GainNode` default. */
const DEFAULT_GAIN_VALUE = 1;

/** Default FFT window size for a freshly created mock `AnalyserNode`, matching the real `AnalyserNode` default. */
const DEFAULT_FFT_SIZE = 2048;

/** Default smoothing constant for a freshly created mock `AnalyserNode`, matching the real `AnalyserNode` default. */
const DEFAULT_SMOOTHING_TIME_CONSTANT = 0.8;

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

/** Recorded `AnalyserNode` state: connect tracking plus settable analysis parameters and injectable sample data. */
export interface MockAnalyserNode extends MockAudioNode {
    /** FFT window size; settable per test. */
    fftSize: number;

    /** Analyzer smoothing constant; settable per test. */
    smoothingTimeConstant: number;

    /** Time-domain samples returned by `getFloatTimeDomainData`; settable per test. */
    mockTimeDomainData: Float32Array;
}

/** Recorded `AudioContext` state: created gain nodes plus resume/close call counts. */
export interface MockAudioContext {
    /** Sample rate in Hz reported by this mock context. */
    readonly sampleRate: number;

    /** Gain nodes created via `createGain()`, in call order. */
    readonly createGainCalls: readonly GainNode[];

    /** Buffer source nodes created via `createBufferSource()`, in call order. */
    readonly createBufferSourceCalls: readonly AudioBufferSourceNode[];

    /** Arguments recorded from every `createBuffer()` call, in call order. */
    readonly createBufferCalls: ReadonlyArray<{ numberOfChannels: number; length: number; sampleRate: number }>;

    /** Stereo panner nodes created via `createStereoPanner()`, in call order. */
    readonly createStereoPannerCalls: readonly StereoPannerNode[];

    /** Analyzer nodes created via `createAnalyser()`, in call order. */
    readonly createAnalyserCalls: readonly AnalyserNode[];

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
    const startCalls: Array<{ when: number; offset?: number; duration?: number }> = [];
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
        start: (when: number = 0, offset?: number, duration?: number) => {
            if (hasStarted) {
                throw new Error('cannot start an AudioBufferSourceNode more than once');
            }

            hasStarted = true;

            const call: { when: number; offset?: number; duration?: number } = { when };

            if (offset !== undefined) {
                call.offset = offset;
            }

            if (duration !== undefined) {
                call.duration = duration;
            }

            startCalls.push(call);
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
 * Creates a mock `AnalyserNode`: a `connect`-tracking node with settable `fftSize` /
 * `smoothingTimeConstant`, and a `getFloatTimeDomainData` that copies from an injectable
 * `mockTimeDomainData` array (zero-filled by default).
 *
 * @returns Mock `AnalyserNode` stub, cast from a plain tracking object.
 */
export function createMockAnalyserNode(): AnalyserNode {
    const connectCalls: unknown[] = [];

    const node = {
        fftSize: DEFAULT_FFT_SIZE,
        smoothingTimeConstant: DEFAULT_SMOOTHING_TIME_CONSTANT,
        mockTimeDomainData: new Float32Array(DEFAULT_FFT_SIZE),
        connectCalls,
        connect: (destination: unknown) => {
            connectCalls.push(destination);

            return destination;
        },
        disconnect: () => {},
        getFloatTimeDomainData: (array: Float32Array) => {
            const source = node.mockTimeDomainData;

            for (let i = 0; i < array.length; i++) {
                // eslint-disable-next-line security/detect-object-injection -- i is a bounded loop index, not user input
                array[i] = source[i] ?? 0;
            }
        },
    };

    return node as unknown as AnalyserNode;
}

/**
 * Creates a fake `AudioBuffer`-shaped object backed by real per-channel `Float32Array` storage,
 * used both for {@link createMockAudioContext}'s default `decodeAudioData` resolution and its
 * `createBuffer()` implementation.
 *
 * @param numberOfChannels - Channel count. Defaults to `1`.
 * @param length - Per-channel sample count. Defaults to `0`.
 * @param sampleRate - Sample rate in Hz. Defaults to {@link MOCK_SAMPLE_RATE}.
 * @returns Stub `AudioBuffer`, cast from a plain tracking object with live channel data.
 */
export function createMockAudioBuffer(
    numberOfChannels: number = 1,
    length: number = 0,
    sampleRate: number = MOCK_SAMPLE_RATE,
): AudioBuffer {
    const channels: Float32Array[] = Array.from({ length: numberOfChannels }, () => new Float32Array(length));

    return {
        sampleRate,
        length,
        duration: length / sampleRate,
        numberOfChannels,
        // eslint-disable-next-line security/detect-object-injection -- channel index is bounded by numberOfChannels
        getChannelData: (channel: number) => channels[channel] ?? new Float32Array(0),
        copyFromChannel: (destination: Float32Array, channelNumber: number, bufferOffset = 0) => {
            // eslint-disable-next-line security/detect-object-injection -- channel index is bounded by numberOfChannels
            const source = channels[channelNumber];

            if (source) {
                destination.set(source.subarray(bufferOffset, bufferOffset + destination.length));
            }
        },
        copyToChannel: (source: Float32Array, channelNumber: number, bufferOffset = 0) => {
            // eslint-disable-next-line security/detect-object-injection -- channel index is bounded by numberOfChannels
            const target = channels[channelNumber];

            if (target) {
                target.set(source, bufferOffset);
            }
        },
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
    const createAnalyserCalls: AnalyserNode[] = [];
    const createBufferCalls: Array<{ numberOfChannels: number; length: number; sampleRate: number }> = [];
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
        createAnalyserCalls,
        createBufferCalls,
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
        createAnalyser: () => {
            const node = createMockAnalyserNode();

            createAnalyserCalls.push(node);

            return node;
        },
        createBuffer: (numberOfChannels: number, length: number, sampleRate: number) => {
            createBufferCalls.push({ numberOfChannels, length, sampleRate });

            return createMockAudioBuffer(numberOfChannels, length, sampleRate);
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
 * Advances (or rewinds) a mock `AudioContext`'s `currentTime`, simulating audio-clock
 * progression for tests exercising `atTime` scheduling or fade-timing assertions anchored to a
 * non-zero clock.
 *
 * @param context - Mock context created by {@link createMockAudioContext} (or the instance
 *   returned by {@link installMockAudioContext}'s `getLastInstance()`).
 * @param currentTime - New `currentTime` value in seconds.
 */
export function setMockCurrentTime(context: AudioContext, currentTime: number): void {
    (context as unknown as { currentTime: number }).currentTime = currentTime;
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
