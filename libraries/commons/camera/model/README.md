# @carma-commons/camera-model

Shared camera specification types with a canonical local camera and projection model.

The package now also owns the pure local-frame and camera-basis helpers that
define the SSOT for:

- `ENU basis <-> local Y-up scene basis`
- `quaternion <-> local camera basis`

## Local Scene Convention

- Basis: right-handed local tangent ENU frame embedded into a local Y-up scene basis
- `+X`: east
- `+Y`: up
- `-Z`: north
- `+Z`: south
- `roll`: positive around the local camera forward axis using Three.js camera semantics

Matrix, quaternion, position, direction, up, and right fields follow Three.js world-space conventions directly.

This is not a Cesium-only convention layer. Cesium adapters, Three-backed tools,
and other mapping-engine integrations should all consume the same shared ENU
to local Y-up scene-basis helpers from this package.
