# Standalone Three.js shadow reference

Story: **Mapping / Shadows / Sun Disc** in `playgrounds/stories`.

The renderer-only entry exports the production `ShadowController` and a small
DOM host for reference fixtures. The host uses the same `buildSharedSceneAccumulator`
as Geoportal through `@carma-mapping/engines/three/primitives/rendering`.
There is no MapLibre map, terrain loader, duplicate solar sampler, or camera jitter.
Scene fixtures use fixed white direct light and hemispherical fill to isolate
shadow geometry; this is not an astronomical/time-of-day lighting calibration.

The production sampler currently assumes a uniform-radiance 0.53-degree solar
disc. Wavelength-dependent limb darkening is not implemented: this is a geometric
sun-shadow reference, not a calibrated spectral solar-radiance model. The
[Hošek/Wilkie solar-radiance model](https://cgg.mff.cuni.cz/projects/SkylightModelling/)
describes why radiance is not uniform across the physical disc. Limb darkening
changes the penumbra profile, not a fully blocked umbra; sky/indirect illumination
must remain a separate light contribution.

The default keeps scene samples in linear FP16 and their progressive average in
FP32. Repeated FP16 or 8-bit averages can accumulate rounding error as sample
count grows. AgX, output encoding and static dithering happen only at display.
The three automatic sun-sampling qualities use 128 / 256 / 512 directions;
increasing depth-map resolution alone cannot remove angular-sampling bands.
Geoportal additionally offers an 8192-sample Ultra preset; see
[whole-scene quality policy and measurements](../QUALITY_PROFILES.md).

## Controls

Object/receiver separation, object shape (including thin occluders), solar
elevation, detail camera, exposure and direct-light intensity are independent
controls. The scene runs only until convergence or another explicit change.

Both Storybook and the Geoportal advanced shadow UI expose RGB buffer format,
sun sample count and geometry MSAA. Full32F disables MSAA because its renderbuffer
support is not portable. The hybrid retains FP16 MSAA with an FP32 average.
The optional ground-texel fit adjusts the light frustum and rectangular depth
target within the same texel budget; the status reports actual dimensions,
ground texels and residual anisotropy when hardware or fidelity limits prevent
isotropy. The conservative offscreen-caster guard is retained.

Single-channel R8 / R16F / R32F and hybrid R16F→R32F in the story render **solar
visibility**, using Three's own shadow query chunks. They are not a monochrome
replacement for Geoportal's RGB/material/atmosphere compositor. Their reference
comparison measures visibility, while RGB comparisons measure linear radiance.

## Benchmark interpretation

The opt-in benchmark uses disjoint-checked GPU timer queries, with synchronous
readback wall time as an explicitly labelled fallback. It excludes warm-up,
interleaves five repetitions, yields between four-sample batches, and restores
the full reference afterwards. Context loss and GL errors invalidate results.
Aborting the fixture releases pending queries and frame waits even in a hidden
tab; query deadlines do not depend on animation frames. Float readback and same-sample-count Full32F reference
generation are excluded from timings. Set MSAA0 for a precision-only comparison;
the hybrid and Full32F use identical Nearest filtering. An error of zero against
Full32F proves buffer agreement, not convergence to a continuous solar integral.

`one-percent-color` and `cached-shadow-map` are deliberately incorrect diagnostic
frames, **not adaptive rendering modes**. They isolate upper bounds on savings
from skipping colour shading or directional depth-map updates respectively.
They must not be selected by Geoportal. No edge-only sampler or WebGPU backend
is enabled by this demo.

WebGPU parity requires a common node/TSL material path plus WebGL2 fallback;
the current GLSL materials and shared MapLibre WebGL textures are not a drop-in
fit for `WebGPURenderer`. Do not silently claim fallback or select a backend
based only on `navigator.gpu` presence.

## Cached RGB plus scalar visibility experiment

Story **Cached Lighting** opts into an R buffer with `cachedLighting`. Two
central-sun RGB targets store the unshadowed and indirect-only scene. The shared
accumulator then combines their linear colors as
`indirect + meanVisibility * (unshadowed - indirect)` before tone mapping.
No lookup table is necessary. The cache is rebuilt on explicit scene/camera/
lighting changes, not once per sun sample. Point-sun previews use full RGB.

Its benchmark interleaves this real method with full RGB sun integration and
includes the two cache captures plus final composition in each measurement.
Image error is measured against the full RGB integral, not merely an R32F mask.
This is currently **story-only, opaque-scene and approximate**: normal/light
angle, specular response, normal maps and transmitted light need not be static
across solar directions. A zero mask-buffer error would not validate this model.

For Geoportal's Lambert terrain, a stronger exact factorization is possible:
accumulate `mean(visibility * max(dot(normal, lightDirection), 0))`, then apply
the cached diffuse RGB coefficient and add indirect light. Do not divide by a
central cosine at grazing angles. PBR buildings and the photogrammetric mesh
(which uses its own shading-normal policy) require their existing RGB response
or a separately validated model; the experiment is not enabled for them.

## Penumbra banding regression

`measureBanding` measures the **plate + R-buffer** fixture after convergence,
before RGB composition, tone mapping or output dither. It does not run in
Geoportal and its readback is excluded from GPU timings. Nine parallel receiver
profiles sample one physical drawing-buffer pixel per step, away from corners.
The straight-edge reference is the circular-segment CDF of the current uniform
0.53-degree disc (small-angle approximation), using the plate's top face.

The metric averages the parallel profiles, registers their 50% crossing by
translation only, and measures residual contour contrast at spans 2/4/8/16/32
pixels: `abs(error[i] - (error[i-span] + error[i+span]) / 2)`. Cropped reference
windows are excluded. Report the worst-scale p95 and maximum in **1/255 solar
visibility units**, not final sRGB levels or perceptual JNDs. Our explicit
engineering gate is p95 <= 0.5, max <= 1, and 10–90% penumbra width error <= 5%.
Width is never fitted; a broad blur cannot pass by removing the contours.
The raw profile RMS and center offset remain separate diagnostics: a banding
pass does not validate position accuracy, material factorization or solar
limb darkening. Existing depth/normal bias displaces the marked fixture's
edge by about 69 drawing-buffer pixels; this gate does not conceal that as
photometric/geometry agreement.

This is a fixture-specific full-reference test, **not CAMBI**. For perceptual
banding assessment of arbitrary final images see
[CAMBI](https://arxiv.org/abs/2102.00079); that no-reference video metric does
not by itself check physically correct penumbra width.

The marked 25 m / 15-degree case at 1304x1520 needs **4096 samples plus
shadow-raster phase sampling** to pass among the tested power-of-two counts:
p95 0.274, max 0.400, width error -0.132%. At 2048 the p95 is 0.551 (fail).
8192 without raster phases still fails at p95 1.033; with phases it reaches
0.168. Both the angular discretization and shadow-texel lattice matter.

The production controller now shifts only its orthographic shadow projection
window within half a shadow texel, using deterministic, antithetic R2 phases.
Light direction, visible camera, terrain and solar extent do not move.
The existing fit/filter guard covers that offset. Restoring the disc center or
switching to point sun restores the exact base frustum. This introduces no
additional render pass and no fixed post-blur; it supersamples the finite
shadow-map raster, following the principle of
[light-space projection jitter](https://diglib.eg.org/items/fa2cbbd4-c5e3-445f-9ce6-1ac1cf6d2bff).

The 4096-sample cached RGB result also retains a measured speed advantage:
2.879 vs 6.173 seconds summed GPU work, median of five interleaved runs,
including cache capture and final composition. Queries bracket 16-round
batches for high-count tests, four for <=512. These are not frame times.
Detail stories default to 4096; Geoportal offers 1024–8192 as explicit slow
reference options without increasing its automatic 128/256/512 defaults.

Hammersley/concentric and stratified/concentric disc alternatives did not beat
the existing Vogel sequence over 32 edge orientations at 512/2048 samples.
They remain reproducible diagnostic scripts in the worktree's `output/`, not
alternate production samplers. No edge-only classifier is inferred from this.
