/** Sharing is safe only for exactly equal typed topology, including winding.
 * This does not make a mutable array immutable or transfer its ownership. */
export const terrainIndexArraysEqual = (
  left: Uint16Array | Uint32Array,
  right: Uint16Array | Uint32Array
): boolean => {
  if (left === right) return true;
  if (left.constructor !== right.constructor || left.length !== right.length)
    return false;
  for (let i = 0; i < left.length; i++) if (left[i] !== right[i]) return false;
  return true;
};
