// Global test setup for blit386.
// Imported by vitest.config.ts setupFiles.

type GlobalRecord = Record<string, unknown>;

/**
 * Installs a global stub when the name is missing in the test environment.
 *
 * @param name Global property name.
 * @param value Stub value to assign.
 */
function installGlobalIfMissing(name: string, value: unknown): void {
    /* eslint-disable security/detect-object-injection -- test setup installs known global stubs by name */
    if (typeof (globalThis as GlobalRecord)[name] === 'undefined') {
        (globalThis as unknown as GlobalRecord)[name] = value;
    }
    /* eslint-enable security/detect-object-injection */
}

/** Provide WebGPU constants that don't exist in Node.js. */
installGlobalIfMissing('GPUBufferUsage', {
    MAP_READ: 0x0001,
    MAP_WRITE: 0x0002,
    COPY_SRC: 0x0004,
    COPY_DST: 0x0008,
    INDEX: 0x0010,
    VERTEX: 0x0020,
    UNIFORM: 0x0040,
    STORAGE: 0x0080,
    INDIRECT: 0x0100,
    QUERY_RESOLVE: 0x0200,
});

/** Provide GPUMapMode constants that don't exist in Node.js. */
installGlobalIfMissing('GPUMapMode', {
    READ: 0x0001,
    WRITE: 0x0002,
});

/** Provide GPUTextureUsage constants that don't exist in Node.js. */
installGlobalIfMissing('GPUTextureUsage', {
    COPY_SRC: 0x01,
    COPY_DST: 0x02,
    TEXTURE_BINDING: 0x04,
    STORAGE_BINDING: 0x08,
    RENDER_ATTACHMENT: 0x10,
});

/**
 * The fallback OffscreenCanvas returns zero-filled RGBA bytes from getImageData().
 * Zero-alpha pixels map to the transparent sentinel (index 0) in SpriteSheet.indexize().
 *
 * Tests that need specific opaque pixel colors must stub OffscreenCanvas themselves
 * (e.g. via vi.stubGlobal('OffscreenCanvas', ...)) before calling indexize().
 */
installGlobalIfMissing(
    'OffscreenCanvas',
    class {
        /** The width of the canvas. */
        public readonly width: number;

        /** The height of the canvas. */
        public readonly height: number;

        /**
         * Creates a new OffscreenCanvas stub with the specified width and height.
         *
         * @param width The width of the canvas.
         * @param height The height of the canvas.
         */
        constructor(width: number, height: number) {
            this.width = width;
            this.height = height;
        }

        /**
         * Returns a mock context for the canvas.
         *
         * @param _contextId The context ID (ignored).
         */
        getContext(_contextId: string) {
            const w = this.width;
            const h = this.height;

            return {
                drawImage: () => {},
                imageSmoothingEnabled: false,
                getImageData: (_x: number, _y: number, _w: number, _h: number) => ({
                    // 4 = bytes per RGBA pixel returned by OffscreenCanvas getImageData().
                    data: new Uint8ClampedArray(w * h * 4),
                }),
            };
        }
    },
);

/** Mock `AudioParam`: tracks the current value; scheduling calls apply it immediately (no real audio clock in tests). */
class MockAudioParam {
    /** Current (immediately applied) parameter value. */
    public value = 1;

    /**
     * Sets `value` immediately (mock: ignores scheduling time).
     *
     * @param value The value to apply.
     * @param _startTime Scheduled start time (ignored).
     */
    setValueAtTime(value: number, _startTime: number) {
        this.value = value;

        return this;
    }

    /**
     * Sets `value` immediately (mock: ignores the ramp duration).
     *
     * @param value The target value.
     * @param _endTime Scheduled ramp end time (ignored).
     */
    linearRampToValueAtTime(value: number, _endTime: number) {
        this.value = value;

        return this;
    }

    /**
     * Jumps straight to the curve's final sample (mock: ignores intermediate samples and timing).
     *
     * @param values Sampled curve values.
     * @param _startTime Scheduled start time (ignored).
     * @param _duration Curve duration in seconds (ignored).
     */
    setValueCurveAtTime(values: Float32Array | readonly number[], _startTime: number, _duration: number) {
        this.value = values[values.length - 1] ?? this.value;

        return this;
    }

    /**
     * No-op in the mock (no scheduled changes to cancel).
     *
     * @param _startTime Time after which scheduled changes would be cleared (ignored).
     */
    cancelScheduledValues(_startTime: number) {
        return this;
    }
}

/** Mock `AudioNode`: tracks connections without producing or routing any audio. */
class MockAudioNode {
    /**
     * Records a connection to another node (mock: no-op, returns the destination).
     *
     * @param destination The node this node connects to.
     */
    connect(destination: unknown) {
        return destination;
    }

    /** Disconnects all outputs (no-op in the mock). */
    disconnect() {}
}

/** Mock `GainNode`: a {@link MockAudioNode} with a {@link MockAudioParam} gain. */
class MockGainNode extends MockAudioNode {
    /** Gain parameter (default 1, matching the real `GainNode` default). */
    public gain = new MockAudioParam();
}

/** Provide `AudioContext` (and `GainNode`/`AudioParam` behavior) that doesn't exist in Node.js or happy-dom. */
installGlobalIfMissing(
    'AudioContext',
    class {
        /** Simulated audio clock; stays at 0 since the mock never advances time. */
        public currentTime = 0;

        /** Context lifecycle state, mirroring the real `AudioContextState` values. */
        public state: 'suspended' | 'running' | 'closed' = 'suspended';

        /** Destination node terminating the bus graph. */
        public destination = new MockAudioNode();

        /** Creates a new {@link MockGainNode}. */
        createGain() {
            return new MockGainNode();
        }

        /** Resolves immediately and flips {@link state} to `'running'`. */
        resume() {
            this.state = 'running';

            return Promise.resolve();
        }

        /** Resolves immediately and flips {@link state} to `'closed'`. */
        close() {
            this.state = 'closed';

            return Promise.resolve();
        }
    },
);
