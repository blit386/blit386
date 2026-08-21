import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { twoslasher } from 'twoslash';
import { TWOSLASH_COMPILER_OPTIONS } from '../twoslash-config.mjs';

// The `Effect` interface example from packages/blit386/docs/guide-post-process-effects.md.
const EFFECT_INTERFACE_EXAMPLE = `import type { Effect, EffectTier, Vector2i } from 'blit386';

export class MyEffect implements Effect {
  public readonly tier: EffectTier = 'display'; // or 'pixel'

  init(device: GPUDevice, format: GPUTextureFormat, displaySize: Vector2i): void {
    // Create pipeline, uniform buffer, sampler.
  }

  updateUniforms(deltaMs: number, sourceSize: Vector2i): void {
    // Write per-frame uniform data to the GPU.
  }

  encodePass(encoder: GPUCommandEncoder, sourceView: GPUTextureView, destView: GPUTextureView): void {
    // Begin a render pass against destView, sample sourceView, draw fullscreen triangle.
  }

  dispose?(): void {
    // Optional: destroy GPU buffers.
  }
}`;

describe('Twoslash WebGPU type resolution (BT-431)', () => {
    test('compiles the Effect interface example with zero diagnostics', () => {
        const result = twoslasher(EFFECT_INTERFACE_EXAMPLE, 'ts', { compilerOptions: TWOSLASH_COMPILER_OPTIONS });
        assert.deepEqual(result.errors, []);
    });

    test('resolves GPUDevice and GPUTextureFormat in the init() hover', () => {
        const result = twoslasher(EFFECT_INTERFACE_EXAMPLE, 'ts', { compilerOptions: TWOSLASH_COMPILER_OPTIONS });
        const hover = result.nodes.find((node) => node.type === 'hover' && node.text.includes('init'));
        assert.ok(hover && 'text' in hover && hover.text, 'expected a hover node for init()');
        assert.match(hover.text, /device: GPUDevice/);
        assert.match(hover.text, /format: GPUTextureFormat/);
    });

    test('resolves GPUCommandEncoder and GPUTextureView in the encodePass() hover', () => {
        const result = twoslasher(EFFECT_INTERFACE_EXAMPLE, 'ts', { compilerOptions: TWOSLASH_COMPILER_OPTIONS });
        const hover = result.nodes.find((node) => node.type === 'hover' && node.text.includes('encodePass'));
        assert.ok(hover && 'text' in hover && hover.text, 'expected a hover node for encodePass()');
        assert.match(hover.text, /encoder: GPUCommandEncoder/);
        assert.match(hover.text, /sourceView: GPUTextureView/);
        assert.match(hover.text, /destView: GPUTextureView/);
    });
});
