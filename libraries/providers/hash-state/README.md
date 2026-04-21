# hash-state

Hash state provider for URL-based application state management.

## Separation of concerns

`@carma-providers/hash-state` is intentionally a **hash codec/state transport layer**.

- It owns hash read/write mechanics and string-to-value / value-to-string codec behavior.
- It may expose hash params, decoded state values, and generic update APIs.
- It does **not** own domain interpretation of those values (for example startup framework choice, map launch preference policy, or view-mode business decisions).
- It does **not** own engine/view-state orchestration logic.

In short: hash-state restores and persists typed hash parameters, while reusable domain hooks/providers in other libraries decide what those values mean.

## Scene descriptor hash helpers

The package provides hash read/write + decode/encode mechanics and exposes decoded values via `useHashState()`.

Default shared CARMA map URL aliases are:

- `lat`
- `lng`
- `zoom`
- optional `b` (bearing 0 from north, clockwise in degrees)
- optional `p` (pitch 0 from nadir, in degrees)
- optional `r` (roll 0 clockwise from camera up in degrees)
- optional `h` (height of viewed at point in ellipsoid meters)
- optional `fov`

Typical usage:

```tsx
import {
  HashStateProvider,
  useHashState,
} from "@carma-providers/hash-state";

function HashConsumer() {
  const { getHashParams, getHashStateValues, updateHashState } = useHashState();

  const hashParams = getHashParams();
  const stateValues = getHashStateValues();

  const writeExample = () => {
    updateHashState(
      { lat: 51.25, lng: 7.15, zoom: 13 },
      { replace: true }
    );
  };

  return null;
}
```

Scene-state/hash projection helpers and launch-mode policy are intentionally out of scope for this package.

For shared launch-mode interpretation from hash parameters, use the generic helpers from `@carma-commons/utils` (for example `resolveHashLaunchMode(...)`).

Inside this package, `SceneViewState` hash encode/decode logic is owned by the specialized `scene-state-hash/*` codecs (single source of truth). Root-level hash codecs only compose those specialized codecs; they do not duplicate `SceneViewState` field encoding logic.

## Running unit tests

Run `nx test hash-state` to execute the unit tests via [Vitest](https://vitest.dev/).
