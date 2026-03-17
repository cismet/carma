# Cesium React scene-state

This package exposes React bindings around Cesium scene-state snapshots.

## Orientation semantics

Scene-state snapshots intentionally expose multiple camera orientation views:

- `camera.worldDirection`, `camera.worldUp`, `camera.worldRight`, `camera.worldQuaternion`
- `camera.cameraModel.pose.{matrixWorld,matrixWorldInverse,basisMatrix,quaternion,basis,...}`
- convenience angles such as `camera.bearingRad`, `camera.pitchRad`, `camera.rollRad`
- convenience orbit parameters such as `camera.cameraModel.pose.{bearing,pitch,range,roll}`

The **authoritative orientation data** is the orthonormal basis / quaternion / matrix representation.

The angle-based fields are still useful for UI, serialization, and engine-to-engine projections, but they should be treated as **derived or informational views**. This matters most near **nadir**: when the camera points straight down, the viewing azimuth becomes underdefined and Euler-style bearing values may drift, jump, or collapse even though the underlying camera basis is still valid.

## ENU anchor origin

When scene-state is converted into the shared object-centric camera model, the ENU frame is centered at the **reference/orbit point itself**.

- anchor coordinates are geodetic $(\phi, \lambda, h)$
- $h$ is the **ellipsoidal (geodetic) height** above the reference ellipsoid
- the ENU origin is therefore the ECEF point obtained from $(\phi, \lambda, h)$
- it is **not** a separate surface point plus an additional post-hoc height offset

This matches Cesium's `lookAt(target, HeadingPitchRange)` semantics, where the orbit frame is built at the `target` point. It differs from Cesium's raw `camera.heading/pitch/roll`, which are derived in an ENU frame centered at the camera position and are exposed here as shared `bearing/pitch/roll` convenience values.

## Practical rule

- Use basis / quaternion / matrices for stable orientation comparison and state hand-off.
- Use `bearing/pitch/range` or `bearing/pitch/roll` for compact orbit controls and projections.
- If both are present and disagree near nadir, trust the basis-bearing camera model first and treat the angle fields as a lossy projection of that state.