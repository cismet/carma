# Shared-scene camera flights

`createCameraFlightPlayer` uses a Three.js `CatmullRomCurve3` in scene metres
and a native `AnimationClip` (JSON round-trip supported) for lens and optional
quaternion pose tracks. Geographic route presets live in commons/resources,
not in a story. Project those coordinates once through the scene host after
sampling their DGM heights. No geometry traversal or terrain raycast per frame.

Three's native animation is the smallest fit for this renderer: spline position,
quaternion tracks and `.fov` tracks need no extra runtime. CZML offers geographic
sampled position/orientation, but would need a separate camera/lens adapter here;
Blender/glTF remains an optional future authoring import, not a second flight engine.
See [AnimationClip](https://threejs.org/docs/pages/AnimationClip.html) and
[CatmullRomCurve3](https://threejs.org/docs/pages/CatmullRomCurve3.html).

Open routes ease into a reverse dolly at endpoints, without teleportation or an
instant 180-degree rotation. A fixed target takes precedence over tangent look;
quaternion tracks take precedence over both. Manual FOV overrides animation.
One busy asynchronous preview per camera bounds readback memory. There is no
10 Hz timer; this is throughput-limited rendering, not a guaranteed 60 fps.
Main-map demand retains primary scheduling priority; finest overlapping demand
wins regardless of camera priority.

Mesh Coverage exposes one Cameras control window, with up to three secondary
views. Camera Windows is only its three-camera stress preset. All share one
scene/renderer/tile pool. ResizeObserver derives pixel dimensions from the image
area (DPR capped at 2, longest side capped at 2048 px), updating projection and
request resolution without manual resolution inputs or scene remounts.
Route and lens controls collapse into the camera header. Pop-outs physically
adopt the stable React portal host/canvas, preserving the camera, path progress,
renderer and requests. Closing the popup docks it; disabling a camera disposes
its demand and preview. Popup blockers leave the view inline with an explanation.
The parent control window's Dock all cameras command handles browser shells that
do not expose popup windows normally. A popup still depends on the parent page.
Diagnostic frames carry all camera snapshots to the existing worker; all clipped
frustum edges remain drawn while crop follows all cameras or one camera id.
These are frustum/tileset-volume intersections, not necessarily near/far planes.
Do not label a tileset-boundary clipping edge as the camera's far plane.

Validation: camera-windows.spec.tsx checks enable/disable, collapsed options,
automatic resolution, stable-canvas adoption/return, release, and blocked popups.
The internal browser verified corner resize, undock and Dock all return; it did
not expose the detached popup as a separately inspectable tab.

### Preview pacing (2026-09-16)

Completed GPU readbacks are staged and presented on the next display frame,
before submitting another capture that can reuse their buffer. There remains
only one readback in flight and one completed image, not a growing frame queue.
The flight clock uses the opener's `performance.now()` throughout canvas
adoption: rAF timestamps from different windows must not be subtracted as if
they shared a time origin. A focused regression covers foreign rAF timestamps,
delayed readback, display-frame presentation and disposal. This adds at most
one display tick of presentation delay and does not guarantee uniform GPU
throughput or fix visible geometry changes during LOD refinement.

## Evidence limits

- Schwebebahn: Barmen OSM route fragment, not the whole line; assumed rail is
  DGM + 13 m, camera + 100 m above that. Not surveyed rail elevations.
- Wupper: Barmen north-bank spline from the existing basemap.de fixture; eye
  DGM + 180 m, aimed at the measured HKW Zoo chimney midpoint. It is a long-range
  riverbank view, not an extracted river centreline near Zoo.
- DGM profile uses z13 and interpolated control heights. Neither route promises
  exact continuous terrain clearance or unobstructed visibility.
- Only the camera path/lens is animated; no second copy of scene geometry.
