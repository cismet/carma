# view-state

Canonical runtime flow in this library:

1. `mapping engine <-> ViewState`
   - pure read/apply adapters in `src/lib/adapters/*` plus runtime engine hooks in `src/lib/runtime/bridges/*`
2. `ViewState <-> ShareableViewState`
   - pure adapter in `src/lib/adapters/shareable.ts`
3. `ShareableViewState <-> hash key/value`
   - `ShareableViewState` is the hash-equivalent numeric payload (degrees + rounded values)
   - the same shareable adapter module owns parsing/normalization rules
   - navigation codec only performs thin transport wiring
4. Navigation manager commits hash updates and restores initial state
   - `src/lib/runtime/providers/navigation/*`

App-level rule:

- For app runtime, use only the canonical flow above.
- Keep 2D hash routing in Geoportal unchanged (`useMapHashRouting` path stays outside this library).

Scope note:

- No direct `mapping engine <-> ShareableViewState` shortcut lane remains in the active runtime.
- Older non-canonical codec paths under `src/lib/shareable/codecs/*` and `src/lib/engines/*` were removed.
- Pure `ViewState` logic, shareable/hash primitives, and angle derivations now live at `src/lib/core/*`.
- Projection helper math was moved into `@carma-commons/camera/model`; no local `src/lib/model/*` folder remains.
- Pure read/apply adapters now live at `src/lib/adapters/*`.
- `src/lib/runtime/*` is reduced to runtime wiring only: provider ownership plus engine-facing runtime hooks. Repo-wide preferred future naming for direct engine bindings is `runtime/integrations/*`, but the current folder stays `runtime/bridges/*` until touched again.
