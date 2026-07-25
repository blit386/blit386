# Easing

<!-- blit386.dev-banner:start -->

<!-- prettier-ignore -->
> [!TIP]
> You're reading the raw source on GitHub. The same page lives at https://blit386.dev/docs/api/easing, typeset like an
> actual docs site and easier on the eyes. Probably the nicer place to read it, but same
> words either way.

<!-- blit386.dev-banner:end -->

Named easing curves for palette fades, audio fades, and demo animation. Evaluate a curve with `applyEasing`, or
interpolate `number` / `Vector2i` / `Color32` / `Rect2i` values with `interpolate`.

Curve math matches [RetroBlit](https://www.badcastle.com/retroblit.html) by Martin Cietwierkowski (`Ease` class, Robert
Penner's easing equations).

<ApiAvailability page="api/easing" />

<Since symbol="EasingFunction" />
<Since symbol="applyEasing" />
<Since symbol="interpolate" />

```ts twoslash
import { applyEasing, interpolate, Color32, Vector2i } from 'blit386';

const t = applyEasing(0.5, 'ease-in-out'); // 0..1 progress → eased value

const pos = interpolate('bounce-out', new Vector2i(0, -40), new Vector2i(0, 80), 0.7);
const tint = interpolate('cubic-out', Color32.white, Color32.green, 0.4);
```

## Curves

`EasingFunction` is a string union. `'ease-in'`, `'ease-out'`, and `'ease-in-out'` are the quadratic family (kept for
existing palette and audio call sites).

| Family           | Identifiers                                         |
| ---------------- | --------------------------------------------------- |
| Linear           | `'linear'`                                          |
| Quadratic        | `'ease-in'`, `'ease-out'`, `'ease-in-out'`          |
| Sine             | `'sine-in'`, `'sine-out'`, `'sine-in-out'`          |
| Cubic            | `'cubic-in'`, `'cubic-out'`, `'cubic-in-out'`       |
| Quartic          | `'quartic-in'`, `'quartic-out'`, `'quartic-in-out'` |
| Quintic          | `'quintic-in'`, `'quintic-out'`, `'quintic-in-out'` |
| Exponential      | `'expo-in'`, `'expo-out'`, `'expo-in-out'`          |
| Circular         | `'circ-in'`, `'circ-out'`, `'circ-in-out'`          |
| Back (overshoot) | `'back-in'`, `'back-out'`, `'back-in-out'`          |
| Elastic          | `'elastic-in'`, `'elastic-out'`, `'elastic-in-out'` |
| Bounce           | `'bounce-in'`, `'bounce-out'`, `'bounce-in-out'`    |

Every curve returns `0` at `t = 0` and `1` at `t = 1`. Values of `t` outside `[0, 1]` are not clamped. Back and elastic
curves may overshoot outside `[0, 1]` for intermediate `t`.

## `applyEasing`

```ts twoslash
import { applyEasing } from 'blit386';

const eased = applyEasing(0.5, 'cubic-in'); // 0.125
```

## `interpolate`

Applies the curve to `t`, then interpolates from `start` to `end`.

- `number` – floating-point blend
- `Vector2i` / `Rect2i` – each component rounded to the nearest integer
- `Color32` – each channel rounded and clamped to `[0, 255]`

```ts twoslash
import { interpolate, Rect2i } from 'blit386';

const bounds = interpolate('sine-in-out', new Rect2i(0, 0, 16, 16), new Rect2i(40, 20, 64, 48), 0.5);
```

<DemoEmbed demo="020-palette-fade" title="BLIT386 palette fade and flash demo" />

<PageChangelog page="api/easing" />

## See also

<Cards>
  <Card title="API: Palette" href="/docs/api/palette">Palette fade effects that consume easing curves.</Card>
  <Card title="API: Audio" href="/docs/api/audio">Bus and music fades that accept `EasingFunction`.</Card>
  <Card title="API: Core Types" href="/docs/api/core-types">`Vector2i`, `Rect2i`, and `Color32` used by `interpolate`.</Card>
</Cards>
