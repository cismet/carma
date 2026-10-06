# Image fidelity comparisons

The single Storybook entrypoint is
`playgrounds/stories/src/stories/oblique/ImageFidelity.stories.tsx`:

- **2026 · AVIF L1–L4**: approved Mitchell/HDRI/sRGB preset, 10-bit 4:4:4, attribution and per-tile measured scores.
- **Chroma and bit depth**: historical 2024 references at L0–L4, four formats at a common measured quality floor, synchronized pan, reference/error views and native precision probe.
- **Resampling filters**: historical Q16 filter matrix at L2–L4, including the pure-kernel references. This experiment does not change the production preset.

These three stories replace ChromaFidelity, BestPracticeTiles, FilterDetailMatrix
and the completed BlindL3L4 experiment. The old blind-test renderer is removed;
source snapshots, measured assets and exported votes remain in private experiment
history. Existing browser vote storage is untouched.

Story components load lazily through direct internal imports; they are not viewer
root exports. No image assets, source metadata or encoder fixtures are bundled
with the viewer. The external comparison server uses the Storybook hostname, so
local and LAN views resolve the same measured data.

The common quality slider selects the smallest measured file meeting the
SSIMULACRA2 floor independently for each format. Unreachable scores are explicitly
labelled. Encoded bit depth and offline 16-bit scores are separate from native
browser decode precision; float16 canvas storage does not prove ten-bit decoding.
