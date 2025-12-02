/**
 * Shape/measurement array utilities
 */

export function filterArrByIds(
  arrIds: (string | number)[],
  fullArray: any[]
): any[] {
  return fullArray.filter((item) => arrIds.includes(item.shapeId));
}

export function findLargestNumber(measurements: any[]): number {
  let largestNumber = 0;
  for (const item of measurements) {
    if (item.number > largestNumber) {
      largestNumber = item.number;
    }
  }
  return largestNumber;
}
