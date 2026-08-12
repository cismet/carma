/**
 * polylabel 2.x ships no declarations of its own.
 *
 * The default export returns the point as a two-element array that also carries
 * `distance`: the signed distance from that point to the nearest polygon edge,
 * positive inside and 0 on the degenerate early-exits.
 */
declare module "polylabel" {
  export default function polylabel(
    polygon: number[][][],
    precision?: number,
    debug?: boolean
  ): number[] & { distance: number };
}
