# @carma-commons/camera-model

Shared camera specification types with a canonical object-centric orbit convention.

The package now also owns the pure object-centric conversion helpers that
define the SSOT for:

- `bearing/pitch/range <-> ENU offset`
- `bearing/pitch/roll <-> quaternion`
- `quaternion <-> camera basis`

## Object-Centric Convention

- Basis: right-handed local tangent ENU frame embedded into a Three-compatible scene basis
- `+X`: east
- `+Y`: up
- `-Z`: north
- `+Z`: south
- `bearing`: positive rotation around `+Y` from north (`-Z`) toward east (`+X`)
- `pitch`: orbit pitch from nadir to horizon
  - `0`: nadir / straight down onto the anchor
  - `+PI/2`: horizon / local EN plane
- `roll`: rotation around the camera forward axis using Three.js camera semantics

Matrix, quaternion, position, direction, up, and right fields follow Three.js world-space conventions directly.
