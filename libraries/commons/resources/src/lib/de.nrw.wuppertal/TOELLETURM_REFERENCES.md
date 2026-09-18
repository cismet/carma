# Toelleturm panorama reference

Part of the [complete Wuppertal tower reference corpus](TOWER_PANORAMA_REFERENCES.md)
for paired multicamera Mesh 2024 / DSM validation.

## Camera convention

Requested virtual eye: **2 m above the inner observation-platform floor in
Mesh 2024**, not above the parapet or the highest triangle. This is a synthetic
viewpoint, not an assertion about the photographer's camera height.

Calibration remains open. The existing story uses `[7.20158, 51.25656]` and
`361.3477 m`, derived from an unverified `358.3477 m + 3 m` reference. Neither
that reference nor its vertical datum proves the platform floor. Do not silently
replace it with `358.3477 + 2` and call the result mesh-calibrated. Confirm the
horizontal position inside the tower and the floor in the mounted mesh first.

## Primary visual reference

- [Requested panorama](https://de.wikipedia.org/wiki/Datei:Wuppertal_Toelleturm_Ponorama.jpg)
- [Commons file and attribution](https://commons.wikimedia.org/wiki/File:Wuppertal_Toelleturm_Ponorama.jpg)
- [Complete category to inspect](https://commons.wikimedia.org/wiki/Category:Views_from_Toelleturm)

The panorama is listed as **16,592 × 1,860 pixels** in
[Panoramics in Wuppertal](https://commons.wikimedia.org/wiki/Category:Panoramics_in_Wuppertal).
Use it for skyline/landmark comparison, not as a calibrated camera projection.
Do not assume it is equirectangular or infer an exact field of view from its
aspect ratio alone.

### Verified constituent references (partial inventory)

These file pages list the panorama under their Commons usage. All four are
2,560 × 1,920 pixels, photographed by **Atamari on 19 April 2009**, and licensed
**CC BY-SA 3.0**. Attribution and any modifications must be retained if reused.

- [0125](https://commons.wikimedia.org/wiki/File:Wuppertal_Adolf-Vorwerk-Str_0125.jpg)
- [0127](https://commons.wikimedia.org/wiki/File:Wuppertal_Adolf-Vorwerk-Str_0127.jpg)
- [0150](https://commons.wikimedia.org/wiki/File:Wuppertal_Adolf-Vorwerk-Str_0150.jpg)
- [0159](https://commons.wikimedia.org/wiki/File:Wuppertal_Adolf-Vorwerk-Str_0159.jpg)

Do not generalize these licenses to every category image or to the stitched
panorama without checking its own attribution. Links only are retained here;
no image binaries have been copied into the repository.

## Research status — 2026-09-14

A newer, higher-quality image **from the observation platform** has not yet
been verified. Search results for newer exterior/ground-level panoramas are
not substitutes for that viewpoint. Upload and page-edit dates are not capture
dates, and pixel count alone is not evidence of better optical quality.

The complete category and panorama source list remain unverified: the Commons
API returned HTTP 429 during inventory retrieval. This document is explicitly
not a complete catalog. Next: complete the source inventory with per-file
capture date, dimensions, author and license; then compare the strongest
platform-view candidates and calibrate the mesh viewpoint.
