# engines/maplibre-gl/

- **utils/** — engine-local pure MapLibre helpers, no high-level deps
- **runtime/** — planned: move `engines/maplibre/` here

## Import Style

- Prefer raw `maplibre-gl` imports for repo-internal code.
- Use `maplibregl.Map` for runtime construction and namespace access:

```ts
import maplibregl from "maplibre-gl";

const map = new maplibregl.Map(...);
```

- Use a type-only alias for signatures to avoid collisions with the JavaScript built-in `Map` and to keep type positions easy to scan:

```ts
import type { Map as MapLibreMap } from "maplibre-gl";
```

Preferred split:

- runtime values: `maplibregl.Map`
- type positions: `MapLibreMap`

## Folder Intent

- The old root pass-through is gone.
- `utils/` is now the concrete home for small pure MapLibre helper logic.
- Keep higher-order runtime or React concerns out of this folder.

## Navigation Controls Note

Low-level MapLibre control helpers may live under `utils/src/lib/controls/*` when they are pure or directly tied to the raw `maplibre-gl` runtime.

Shared runtime-bound navigation control composition belongs in:

- [`../../engines-interop/navigation-controls/README.md`](../../engines-interop/navigation-controls/README.md)

Presentation-only control chrome belongs in:

- [`../../map-controls-layout/README.md`](../../map-controls-layout/README.md)
