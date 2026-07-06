import { describe, expect, it } from 'vitest';

import { createMockAudioParam, type MockAudioParam } from '../__test__/webaudio-mock';
import { applyAudioParamRamp } from './AudioParamRamp';

describe('applyAudioParamRamp', () => {
    it('sets the value immediately when fadeMs is omitted', () => {
        const param = createMockAudioParam(1);

        applyAudioParamRamp(param, 0, 0.5, undefined, 'linear');

        expect(param.value).toBe(0.5);
    });

    it('sets the value immediately when fadeMs is zero or negative', () => {
        const param = createMockAudioParam(1);

        applyAudioParamRamp(param, 0, 0.5, 0, 'linear');

        expect(param.value).toBe(0.5);
    });

    it('cancels a pending ramp before setting the value immediately, so it cannot override the new value later', () => {
        const param = createMockAudioParam(1) as unknown as MockAudioParam;

        // Schedule a ramp toward 0.9 ending at t=1.
        applyAudioParamRamp(param as unknown as AudioParam, 0, 0.9, 1000, 'linear');

        // Immediately override with 0.5 at t=0.3, before the ramp above would have finished.
        applyAudioParamRamp(param as unknown as AudioParam, 0.3, 0.5, undefined, 'linear');

        expect(param.cancelScheduledValuesCalls).toEqual([0, 0.3]);
        expect(param.value).toBe(0.5);
    });

    it('schedules a linear ramp anchored to currentTime', () => {
        const param = createMockAudioParam(1) as unknown as MockAudioParam;

        applyAudioParamRamp(param as unknown as AudioParam, 2, 0.25, 500, 'linear');

        expect(param.cancelScheduledValuesCalls).toEqual([2]);
        expect(param.setValueAtTimeCalls).toEqual([{ value: 1, startTime: 2 }]);
        expect(param.linearRampToValueAtTimeCalls).toEqual([{ value: 0.25, endTime: 2.5 }]);
        expect(param.value).toBe(0.25);
    });

    it('samples an eased curve via setValueCurveAtTime for non-linear easing', () => {
        const param = createMockAudioParam(0) as unknown as MockAudioParam;

        applyAudioParamRamp(param as unknown as AudioParam, 1, 1, 200, 'ease-out');

        expect(param.setValueCurveAtTimeCalls).toHaveLength(1);
        expect(param.setValueCurveAtTimeCalls[0]?.startTime).toBe(1);
        expect(param.setValueCurveAtTimeCalls[0]?.duration).toBe(0.2);
        expect(param.value).toBeCloseTo(1, 5);
    });
});
