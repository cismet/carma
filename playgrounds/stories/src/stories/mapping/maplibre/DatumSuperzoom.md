# Atmospheric refraction and datum-gradient reference

Tags: stories, atmosphere, geodesy, webgpu
Role: current WebGPU horizon experiment and numerical GCG2016 comparison limits.
Load when: changing the refraction story, atmospheric profile math or datum-gradient interpretation.

## WebGPU refraction story

`AtmosphericRefractionWebGPU.stories.tsx` exports `terrain-and-atmosphere-refraction-webgpu--refraction`. It compares straight rays on the left with height-dependent dry-air refractive bending on the right over the Toelleturm–Nordhelle corridor. Both panels use attenuation. The story is an experimental visualization, not a measured Wuppertal weather profile, certified visibility calculation or production terrain-loader change.

The ray model uses an approximate dry-air refractivity at nominal 550 nm, `n−1 = 0.0002778 (p/1013.25)(288.15/T)`, a hydrostatic pressure approximation and a smooth tanh temperature transition. Steps are bounded to 128, 256, 512 or 1,024. Temperature and pressure presets refer to observer altitude; inversion centre is ellipsoidal altitude and transition width is a tanh scale. The controls expose temperature, pressure, lapse, inversion, layer height, depth, visibility, chart display, sun hour and vertical FOV. The default FOV is 4° and the control range is 1–4°. The model omits humidity, CO₂, chromatic splitting and horizontal meteorological gradients; it is not a complete Ciddor or Edlén implementation.

| Preset | Observer conditions | Independent visibility input |
| --- | --- | --- |
| Ideal | 15°C, 970 hPa; refraction retained | Extinction distance `10¹²` m, an unattainable upper-bound control. |
| Mixed air | 15°C, 970 hPa; −6.5 K/km lapse | 80 km. |
| Illustrative inversion | 5°C, 990 hPa; +5 K transition near 450 m | 25 km. |
| Summer haze | 24°C, 975 hPa; +2 K transition near 600 m | 12 km. |

Visibility is supplied independently of temperature and is not an observed frequency or forecast. The story reuses `AtmosphericSunlightEvaluator` and `buildAtmosphericSky` through a bounded 512×256 WebGL sky capture uploaded to WebGPU. Surface-distance filtering uses approximate RGB Beer–Lambert and airlight with the `3.912/V` reference coefficient and wavelength-weighted extinction. Approximate gamma-2.2 composition is not colourimetric calibration. This is not a WGSL port of the full addon scattering stack.

Eight authored 100×100 m sRGB primary, secondary, black and white charts occupy separate angular slots at 5, 10, …, 40 km. They are not measured ColorChecker spectral targets. In-world labels mark their distances; artificial chart heights keep the test visible, although terrain can still occlude them.

## Terrain and rendering bounds

Real Terrarium samples populate one 128×1024 R32Float terrain-height texture (0.5 MiB). Requests are sequential and capped at 32 coarse source tiles with a 32 MiB source cache. The canvas is limited to 960×540; it renders on control changes without a continuous animation loop. One renderer supplies the side-by-side and scissor comparison, so moving the divider does not restart terrain loading. The corridor uses a constant-radius Earth, linear datum interpolation and an illustrative cylindrical tower. Coarse unsampled ridges, NoData and source holes cannot prove a clear sightline. Device absence or loss is reported; no WebGL fallback is supplied.

The chart and terrain geometry were visible in a local browser smoke run with no shader-console error. This checks that the demonstration draws, not its physical accuracy. Approximate tower geometry, coarse terrain, coarsely sampled terrain and simplified datum interpolation do not establish 10 cm vertical accuracy. A sampled raster ground height can differ from the independently sourced tower anchor without proving that the tower physically levitates.

## Datum-gradient numerical reference

For a fixed ellipsoidal observer, compare spatial conversion `h = H + ζ(location)` with the explicit approximation `h = H + ζ(eye)`. This isolates variation in the GCG2016 anomaly, not the roughly 47 m common offset. The constant-anomaly equation is a diagnostic approximation, not another physical datum. Tower silhouettes are authored from resource references rather than surveyed 3D shapes. The separate datum-superzoom Storybook export is not active; these values remain a numerical reference for interpreting the horizon experiment.

| Site | Bundled GCG2016 ζ | Difference from Toelleturm eye |
| --- | ---: | ---: |
| Toelleturm (7.20158, 51.25656) | 46.617822685 m | 0 |
| WDR Nordhelle (7.7566997, 51.1480857) | 47.673131564 m | +1.055308879 m |
| Hordtmast (7.13413305, 51.3562576) | 46.151242770 m | −0.466579915 m |

An 11×11 sample across 7.0–7.3° longitude and 51.16–51.32° latitude gave ζ from 46.078384201 to 47.022004946 m. It is a rectangular sample, not a municipal boundary or continuous-extrema proof. `libraries/geo/proj/src/lib/gcg2016-superzoom.spec.ts` reproduces the values. Decimal digits describe numerical model output, not survey accuracy. Physical visibility would also require validated terrain, vegetation/buildings, refraction and target positions.

## Sources and interpretation

- [NIST refractive-index documentation](https://emtoolbox.nist.gov/wavelength/documentation.asp) explains Ciddor/modified Edlén and density dependence; this story uses a narrower approximation.
- [Ciddor's visible/NIR paper](https://pubmed.ncbi.nlm.nih.gov/21085275/) is the primary optical reference.
- [DWD Promet 98](https://www.dwd.de/DE/leistungen/pbfb_verlag_promet/pdf_promethefte/98_pdf.pdf?__blob=publicationFile&v=2) discusses inversions and valley cold-air pools; presets are illustrative rather than measured conditions.
- [ITU P.453](https://www.itu.int/rec/r-rec-p.453/en) concerns radio propagation and is not the optical ray-bending model used here.
