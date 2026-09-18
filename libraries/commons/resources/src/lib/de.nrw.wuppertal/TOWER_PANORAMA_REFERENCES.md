# Wuppertal tower panorama validation references

## Scope

Use **all files recursively** under
[Views from towers in Wuppertal](https://commons.wikimedia.org/wiki/Category:Views_from_towers_in_Wuppertal)
as the reference corpus for multicamera panorama comparisons against **Mesh
2024 and raster DSM terrain**. Include nested church-tower categories, individual
directional photographs and panorama source frames, not just stitched panoramas.
Deduplicate by Commons file identity when a file belongs to several categories.

This is a reference/test specification, not a completed image inventory or a
claim that the comparisons already pass. The parent category could not be
retrieved on 2026-09-14. Indexed Commons pages identify the following relevant
subsets; the list is not asserted to be exhaustive:

- [Toelleturm](https://commons.wikimedia.org/wiki/Category:Views_from_Toelleturm)
- [Bismarckturm](https://commons.wikimedia.org/wiki/Category:Views_from_Bismarckturm_(Wuppertal))
- [Elisenturm](https://commons.wikimedia.org/wiki/Category:Views_from_Elisenturm_(Wuppertal))
- [Von-der-Heydt-Turm](https://commons.wikimedia.org/wiki/Category:Views_from_Von-der-Heydt-Turm)
- [Rathausturm Elberfeld](https://commons.wikimedia.org/wiki/Category:Views_from_Rathausturm_(Wuppertal-Elberfeld))
- [Friedhofskirche](https://commons.wikimedia.org/wiki/Category:Views_from_Friedhofskirche_(Wuppertal))

Rathausturm Elberfeld is **not** the existing Rathaus Barmen camera preset.
See [Toelleturm reference details](TOELLETURM_REFERENCES.md) for the requested
2 m eye offset above the inner mesh platform and the unresolved absolute pose.

## Per-reference evidence

Retain file page, original image URL and revision, author, individual license,
capture date (separate from upload date), dimensions, source-frame relationships,
viewpoint evidence and known projection/FOV. Keep unknown values unknown.
Category membership alone does not establish exact camera position or height.
Store metadata here; do not bundle full-resolution imagery into story builds.
Check each file's attribution before displaying or distributing a copy.

## Comparison procedure

1. Establish one common world-space observer and camera array for both datasets.
   Do not independently snap the eye to each dataset: that would hide vertical
   registration differences. Record the eye datum and mesh mount correction.
2. Render Mesh 2024 and DSM separately with identical orientation, projection,
   segment count, output size and clipping. DGM is an optional ground-only
   diagnostic, not a substitute for the requested DSM comparison.
3. Match identifiable landmark bearings and then the skyline elevation profile.
   Without a known photo projection, compare landmarks qualitatively; do not
   claim pixel-error accuracy or stretch a photograph to force agreement.
4. Check array segment seams and wrap, foreground occlusion, roof/tree silhouettes,
   distant ridges, terrain coverage and persistence while rotating the panorama.
   Separate camera/mount errors from tile coverage and LOD failures.
5. Record each reference as pending, matched, mismatch or uncalibrated, with the
   photo identity, camera pose, data revisions, rendering settings and screenshots.
   Explain capture-year, seasonal vegetation and reconstruction differences.

Older and lower-resolution photos remain in the corpus. They can provide useful
complementary bearings even when newer photographs are preferred for visual QA.
Neither a plausible screenshot nor agreement with an uncalibrated photograph
proves survey-grade elevation accuracy.

## Next validation step

Complete the recursive Commons inventory, then calibrate Toelleturm and run the
first paired Mesh/DSM comparison before replicating the setup at other towers.
No completed browser comparison is recorded yet.
