# Datum gradient superzoom

ID: DATUM-SUPERZOOM-20260914 · 2026-09-14 · implemented diagnostic

## Full-frame terrain revision

### Separate WebGPU experiment

#### Layered-profile revision

Follow-up: chart headers now contain in-world 5–40 km bitmap labels. `ideal`
sets the extinction distance to 1e12 m (effectively no extinction), retaining
refraction. This is an upper-bound control, not physically attainable weather.

The constant-k description below is superseded. Current rays integrate a
height-dependent dry-air refractivity gradient with bounded steps. A density
approximation n−1 = 0.0002778 (p/1013.25)(288.15/T) at nominal 550 nm is used,
with hydrostatic pressure approximation and a smooth tanh temperature step.
This is NOT a complete Ciddor/Edlén implementation: humidity, CO2 corrections,
chromatic ray splitting and horizontal meteorological gradients are omitted.
Preset temperatures/pressures are at the observer, not sea level. Inversion
center is ellipsoidal altitude; width is tanh scale, not a sharp layer edge.

Presets: mixed air (15°C, 970 hPa, −6.5 K/km); illustrative inversion
(5°C, 990 hPa, +5 K transition around 450 m); summer haze (24°C, 975 hPa,
+2 K around 600 m). Visibility parameters are independent aerosol inputs,
not inferred from temperature. They are plausible scenarios, not observations
or established frequency statistics for Wuppertal. Custom controls expose all
profile parameters. Left rays stay straight; both panels retain attenuation.

The exact addon `AtmosphericSunlightEvaluator` and `buildAtmosphericSky` are
reused via a bounded 512×256 WebGL sky capture uploaded to WebGPU. This is not
a WGSL port of the complete scattering stack. Surface-distance filtering uses
an explicitly approximate RGB Beer–Lambert/airlight model with a 3.912/V
reference coefficient and wavelength-weighted extinction. Composition uses
approximate gamma-2.2 conversion; it is not a colorimetric calibration.

Eight authored sRGB primary/secondary/black/white charts, each 100×100 m,
occupy disjoint angular slots at 5,10,…,40 km. These are NOT ColorChecker
spectral reflectance targets. Their heights are deliberately artificial to
keep the test useful; terrain can still obscure them. All eight were visible
in the browser default screenshot. Shader compiled with no console errors.

Sources reviewed:
- NIST, optical refractive index, Ciddor/modified Edlén and density dependence:
  https://emtoolbox.nist.gov/wavelength/documentation.asp
- Ciddor's original visible/NIR paper:
  https://pubmed.ncbi.nlm.nih.gov/21085275/
- DWD Promet 98, inversion mechanisms and valley cold-air pools:
  https://www.dwd.de/DE/leistungen/pbfb_verlag_promet/pdf_promethefte/98_pdf.pdf?__blob=publicationFile&v=2
- ITU P.453 is a RADIO model and was not used for optical ray bending:
  https://www.itu.int/rec/r-rec-p.453/en

`AtmosphericRefractionWebGPU.stories.tsx` adds the stable story ID
`terrain-and-atmosphere-refraction-webgpu--refraction`. It compares vacuum
against a constant ray-curvature k/R approximation, not a measured refractive
index profile or a full atmospheric lens. Its positive-k rays curve downward.
The terrain is sampled from real Terrarium tiles into one 128×1024 R32Float
texture (0.5 MiB). Source requests are sequential, capped at 32 coarse tiles;
the source cache is 32 MiB. The canvas is capped at 960×540 and renders only
on changes, with 128–1024 ray steps. There is no continuous animation loop.

The existing Chrome adapter compiled and rendered the WGSL without console
errors. Four terrain tiles loaded. A 44×39 m sampled height field, spherical
curvature, linear datum interpolation and simplified tower do NOT establish
10 cm vertical approximation accuracy. Coarse terrain can visibly disagree
with the independently sourced tower ground anchor; do not interpret that as
physical levitation or a validated viewshed. Device absence/loss is reported.
No WebGL fallback or production-loader changes are made.

Supersedes the unobstructed 0.2° framing below. Current default fits the full
primary tower and depressed horizon with at least 1.4° FOV. Readout normalizes
the projected displacement to 2160 vertical pixels without allocating a 4K
offscreen framebuffer. One renderer provides side-by-side and scissor-slider
views. Changing comparison or divider does not restart terrain loading.

Story-only `datum-superzoom-marcher.ts` reuses the raster source and worker
decoder, not the main manager's admission policy. It marches coarse z10 tiles
then near-to-far refinement through z13, retains coarse coverage, and masks
parent quadrants only after complete child geometry is installed. Sparse ray
tests against nearer terrain skip refinement with a 20 m distance margin.
This is a heuristic, not a certified cross-level visibility envelope.

Limits: one request at a time, 192 tiles, 64 MiB estimated geometry arrays,
32 MiB source cache, 33×33 vertices per published tile, DPR capped at 1.5.
Geometry accounting is not total browser/GPU memory; GPU copies, decoder
transients and framebuffer overhead are additional. Abort on unmount/preset
change; stop refinement rather than wait for memory.

Browser smoke observations: Nordhelle 24 tiles / 2.7 MiB geometry / 5 skipped
refinements; Langenberg 35 / 4.1 MiB / 6. Full towers and terrain rendered.
The 2160 px displacement is 2.30 px and 2.41 px respectively. No production
loader modifications or claims of guaranteed occlusion correctness.

## Decision

Compare spatial GCG2016 conversion h = H + ζ(location) with an approximation
h = H + ζ(eye). Keep the exact same ellipsoidal observer and camera. This
isolates the nonconstant height anomaly, not the approximately 47 m common
offset. Neither mode is an alternative physical datum: the constant mode is
explicitly an approximation. No exaggeration, refraction, or terrain occlusion.

Reuse authored resource tower geometries and the existing ECEF landmark
renderer. These approximate silhouettes do not establish survey accuracy.

## Evidence

Bundled GCG2016 model, sampled through getGcg2016HeightAnomalies:

| Site (longitude, latitude) | ζ metres | Difference from eye |
| --- | ---: | ---: |
| Toelleturm (7.20158, 51.25656) | 46.617822685 | 0 |
| WDR Nordhelle (7.7566997, 51.1480857) | 47.673131564 | +1.055308879 |
| Hordtmast (7.13413305, 51.3562576) | 46.151242770 | -0.466579915 |

An 11×11 coarse sample across longitude 7.0–7.3 and latitude 51.16–51.32
returned ζ = 46.078384201–47.022004946 m. This rectangular regional sample
is not an administrative Wuppertal polygon or a proof of continuous extrema.
Reproduction: libraries/geo/proj/src/lib/gcg2016-superzoom.spec.ts.
Displayed decimal precision is numerical model output, not physical accuracy.

The story uses a 0.2° vertical field of view. Actual CSS-pixel displacement
is recomputed by projecting both target tips through the same Three camera
on resize. In the existing Chrome Storybook, Langenberg returned 10.04 CSS px
at 905 px canvas height and 12.05 km slant distance; overlay visibly rendered.
Nordhelle is roughly 4.5 px at 600 px height. This is a calculated projection,
not an image registration measurement. No performance benchmark is claimed.

## Alternatives

- Raw H against h with unchanged camera: rejected by inspection; introduces
  a common-offset mismatch rather than isolating spatial variation.
- Full terrain viewshed: deferred; this story deliberately omits occluders.

Revisit when comparing physical visibility, refractive bending, or surveyed
target positions rather than datum-gradient projection.
