import type { AnnotationCoverage, AnnotationGroup } from "./types";

/** the configured scale window as factors, e.g. 100–400 % becomes 1 and 4 */
export type ZoomScales = { min: number; max: number };

/** the drawing that owns a map zoom, if one does */
export const coveringGroup = (groups: AnnotationGroup[], zoom: number) =>
  groups.find(
    (group) =>
      group.coverage && zoom >= group.coverage.from && zoom < group.coverage.to
  );

/**
 * The range a drawing claims when its first stroke lands at `anchorZoom`. That
 * is where it renders at 100 %, so the window reaches `log2(min)` levels below
 * it and `log2(max)` above — with 50–200 % one level each way.
 *
 * Both ends are then cut at the neighbouring drawings, which is what keeps two
 * drawings from ever owning the same zoom. The price is that a drawing started
 * close to another one does not reach the full window.
 */
export const coverageAround = (
  anchorZoom: number,
  { min, max }: ZoomScales,
  groups: AnnotationGroup[]
): AnnotationCoverage => {
  let from = anchorZoom + Math.log2(min);
  let to = anchorZoom + Math.log2(max);
  groups.forEach((group) => {
    const coverage = group.coverage;
    if (!coverage) {
      return;
    }
    if (coverage.to <= anchorZoom) {
      from = Math.max(from, coverage.to);
    } else if (coverage.from > anchorZoom) {
      to = Math.min(to, coverage.from);
    }
  });
  return { from, to };
};
