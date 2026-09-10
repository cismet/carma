/** Antithetic R2 raster phases, bounded to half a shadow texel. This jitters
 * only the light's sampling lattice, never the eye camera or sun direction.
 * Pairs have exactly zero mean; the sun disc itself is still integrated by
 * the production angular sampler. No additional shadow-map renders.
 */
export const shadowRasterOffset = (
  round: number
): readonly [number, number] => {
  const pair = Math.floor(round / 2) + 1;
  const sign = round % 2 === 0 ? 1 : -1;
  return [
    sign * (((pair * 0.7548776662466927) % 1) - 0.5),
    sign * (((pair * 0.5698402909980532) % 1) - 0.5),
  ];
};
