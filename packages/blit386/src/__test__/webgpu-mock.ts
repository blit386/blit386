/**
 * Lightweight WebGPU mock factories for unit and integration tests.
 * Provides stub objects that track calls without requiring a real GPU.
 */

/** Default width and height for mock textures when a descriptor omits dimensions. */
const DEFAULT_SIZE_PX = 256;

/**
 * Palette uniform byte size: 256 palette indices x vec4(f32) x 4 bytes.
 * Matches {@link WebGPURenderer} palette buffer layout.
 */
const INDEX_COUNT = 256;
const RGBA_COMPONENT_COUNT = 4;
const BYTES_PER_FLOAT32 = 4;
const BUFFER_BYTE_SIZE = INDEX_COUNT * RGBA_COMPONENT_COUNT * BYTES_PER_FLOAT32;

/** Options for creating a mock GPUBuffer stub. */
type MockBufferOptions = {
    /** Buffer size in bytes. */
    size: number;

    /** Buffer usage flags. */
    usage: GPUBufferUsageFlags;

    /** Buffer label. */
    label: string;
};

/**
 * Creates a mock GPUBuffer stub with the shared map/unmap shape used across mocks.
 *
 * @param options Buffer size, usage flags, and label.
 * @param options.size Buffer size in bytes.
 * @param options.usage Buffer usage flags.
 * @param options.label Buffer label.
 * @returns Mock GPUBuffer stub.
 */
function createMockGPUBufferStub({ size, usage, label }: MockBufferOptions): GPUBuffer {
    return {
        size,
        usage,
        label,
        mapAsync: () => Promise.resolve(),
        getMappedRange: () => new ArrayBuffer(size),
        unmap: () => {},
        destroy: () => {},
    } as unknown as GPUBuffer;
}

/**
 * Resolves mock texture width and height from a WebGPU texture descriptor size field.
 *
 * @param size Descriptor size (scalar, tuple, or extent dict).
 * @returns Width and height in pixels.
 */
function resolveMockTextureSize(size: GPUTextureDescriptor['size']): { width: number; height: number } {
    if (typeof size === 'number') {
        return { width: size, height: size };
    }

    // Resolve array size as width/height, defaulting to DEFAULT_SIZE_PX if undefined.
    if (Array.isArray(size)) {
        return {
            width: size[0] ?? DEFAULT_SIZE_PX,
            height: size[1] ?? DEFAULT_SIZE_PX,
        };
    }

    const extent = size as GPUExtent3DDict;

    return {
        width: extent.width,
        height: extent.height ?? DEFAULT_SIZE_PX,
    };
}

/**
 * Creates a mock GPUTexture.
 *
 * @param width - Texture width in pixels.
 * @param height - Texture height in pixels.
 * @param label - Texture label.
 * @returns Mock GPUTexture stub.
 */
export function createMockGPUTexture(
    width = DEFAULT_SIZE_PX,
    height = DEFAULT_SIZE_PX,
    label = 'MockTexture',
): GPUTexture {
    return {
        width,
        height,
        depthOrArrayLayers: 1,
        mipLevelCount: 1,
        sampleCount: 1,
        dimension: '2d',
        format: 'rgba8unorm',
        usage: 0,
        label,
        createView: () => ({ label: 'MockTextureView' }) as unknown as GPUTextureView,
        destroy: () => {},
    } as unknown as GPUTexture;
}

/**
 * Creates a mock GPURenderPassEncoder that records calls.
 *
 * @returns Mock render pass encoder with call tracking.
 */
export function createMockRenderPassEncoder(): GPURenderPassEncoder {
    return {
        setPipeline: () => {},
        setBindGroup: () => {},
        setVertexBuffer: () => {},
        draw: () => {},
        end: () => {},
        label: 'MockRenderPass',
    } as unknown as GPURenderPassEncoder;
}

/**
 * Creates a mock GPUDevice with stub methods.
 *
 * @returns Mock GPUDevice stub.
 */
export function createMockGPUDevice(): GPUDevice {
    const mockPipeline = {
        getBindGroupLayout: () => ({ label: 'MockBindGroupLayout' }),
        label: 'MockPipeline',
    } as unknown as GPURenderPipeline;

    return {
        /**
         * Creates a mock GPUShaderModule stub.
         *
         * @returns Mock GPUShaderModule stub.
         */
        createShaderModule: () => ({ label: 'MockShaderModule' }) as unknown as GPUShaderModule,

        /**
         * Creates a mock GPURenderPipeline stub.
         *
         * @returns Mock GPURenderPipeline stub.
         */
        createRenderPipeline: () => mockPipeline,

        /**
         * Creates a mock GPUBuffer stub.
         *
         * @param desc Buffer descriptor.
         * @returns Mock GPUBuffer stub.
         */
        createBuffer: (desc: GPUBufferDescriptor) =>
            createMockGPUBufferStub({
                size: desc.size,
                usage: desc.usage,
                label: desc.label ?? 'MockBuffer',
            }),

        /**
         * Creates a mock GPUBindGroup stub.
         *
         * @returns Mock GPUBindGroup stub.
         */
        createBindGroup: () => ({ label: 'MockBindGroup' }) as unknown as GPUBindGroup,

        /**
         * Creates a mock GPUSampler stub.
         *
         * @returns Mock GPUSampler stub.
         */
        createSampler: () => ({ label: 'MockSampler' }) as unknown as GPUSampler,

        /**
         * Creates a mock GPUTexture stub.
         *
         * @param desc Texture descriptor.
         * @returns Mock GPUTexture stub.
         */
        createTexture: (desc: GPUTextureDescriptor) => {
            const { width, height } = resolveMockTextureSize(desc.size);

            return createMockGPUTexture(width, height, desc.label ?? 'MockTexture');
        },

        /**
         * Creates a mock GPUCommandEncoder stub.
         *
         * @returns Mock GPUCommandEncoder stub.
         */
        createCommandEncoder: () => ({
            beginRenderPass: () => createMockRenderPassEncoder(),
            finish: () => ({ label: 'MockCommandBuffer' }) as unknown as GPUCommandBuffer,
            label: 'MockCommandEncoder',
        }),

        /** Queue for submitting GPU commands. */
        queue: {
            writeBuffer: () => {}, // uniform/vertex buffer uploads
            writeTexture: () => {}, // r8uint indexed texture uploads
            copyExternalImageToTexture: () => {}, // rgba8unorm image uploads
            submit: () => {}, // command buffer submission
            onSubmittedWorkDone: () => Promise.resolve(), // GPU work completion signal
            label: 'MockQueue',
        },

        /** Set of supported features. */
        features: new Set(),

        /** Supported limits. */
        limits: {} as GPUSupportedLimits,

        /** Promise that resolves when the device is lost. */
        lost: Promise.resolve({ reason: undefined, message: '' } as unknown as GPUDeviceLostInfo),

        /** Destroys the device. */
        destroy: () => {},

        /** Label for the device. */
        label: 'MockDevice',
    } as unknown as GPUDevice;
}

/**
 * Creates a mock GPUCanvasContext.
 *
 * @returns Mock GPUCanvasContext stub.
 */
export function createMockGPUCanvasContext(): GPUCanvasContext {
    return {
        configure: () => {},
        getCurrentTexture: () => createMockGPUTexture(),
        canvas: {} as HTMLCanvasElement,
    } as unknown as GPUCanvasContext;
}

/**
 * Creates a mock GPUBuffer matching the real 4096-byte palette uniform layout.
 * Returns a plain object - does not call device.createBuffer.
 *
 * @returns Mock GPUBuffer stub.
 */
export function createMockPaletteBuffer(): GPUBuffer {
    return createMockGPUBufferStub({
        size: BUFFER_BYTE_SIZE,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        label: 'Mock Palette Buffer',
    });
}

/**
 * Installs a mock navigator.gpu on globalThis for tests.
 * Call in beforeEach/beforeAll for tests needing WebGPU API presence.
 */
export function installMockNavigatorGPU(): void {
    const mockGPU = {
        requestAdapter: async () => ({
            requestDevice: async () => createMockGPUDevice(),
            features: new Set(),
            limits: {} as GPUSupportedLimits,
            info: { vendor: 'mock', architecture: 'mock', device: 'mock', description: 'Mock GPU' },
        }),

        getPreferredCanvasFormat: () => 'bgra8unorm' as GPUTextureFormat,
    };

    // Use Object.defineProperty to override navigator (may be a getter in Node.js).
    const existingNav = typeof navigator === 'undefined' ? {} : navigator;
    Object.defineProperty(globalThis, 'navigator', {
        value: { ...existingNav, gpu: mockGPU },
        writable: true,
        configurable: true,
    });
}

/**
 * Removes the mock navigator.gpu from globalThis.
 * Call in afterEach/afterAll to clean up.
 */
export function uninstallMockNavigatorGPU(): void {
    if ('navigator' in globalThis) {
        const nav = globalThis.navigator as unknown as Record<string, unknown>;

        delete nav.gpu;
    }
}
