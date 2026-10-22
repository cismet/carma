/** The string ids a Cesium pick may carry: the object's own id, a polygon group id inside it, the primitive's id. */
export const resolvePickedIdCandidates = (pickedObject: unknown): string[] => {
  if (typeof pickedObject !== "object" || pickedObject === null) {
    return [];
  }
  const candidates: unknown[] = [];
  const directId = (pickedObject as { id?: unknown }).id;
  candidates.push(directId);
  if (typeof directId === "object" && directId !== null) {
    candidates.push((directId as { polygonGroupId?: unknown }).polygonGroupId);
  }
  const primitive = (pickedObject as { primitive?: unknown }).primitive;
  if (typeof primitive === "object" && primitive !== null) {
    candidates.push((primitive as { id?: unknown }).id);
  }
  return candidates.filter(
    (candidate): candidate is string => typeof candidate === "string"
  );
};
