/**
 * Factory functions that return pre-configured stacks of display-tier effects.
 *
 * Each preset returns a fresh array of `Effect` instances; call once per
 * registration. The returned effects are added to the engine's display chain
 * via {@link BT.effectAdd}.
 */

export { amber } from './amber';
export { crtPipBoy } from './crtPipBoy';
export { green } from './green';
