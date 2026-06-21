# Easing

<!-- blit386.dev-banner:start -->

<!-- prettier-ignore -->
> [!TIP]
> You're reading the raw source on GitHub. The same page lives at https://blit386.dev/docs/api/easing, typeset like an
> actual docs site and easier on the eyes. Probably the nicer place to read it, but same
> words either way.

<!-- blit386.dev-banner:end -->

Palette fade effects accept an `EasingFunction`. Use `applyEasing` to evaluate named curves:

```ts
import { applyEasing } from 'blit386';

const t = applyEasing('ease-in-out', 0.5); // 0..1 progress → eased value
```

## See also

<Cards>
  <Card title="API: Palette" href="/docs/api/palette">Palette fade effects that consume easing curves.</Card>
  <Card title="API: Core" href="/docs/api/core">Bootstrap, init, default configuration.</Card>
</Cards>
