export function filterArrByIds(
  arrIds: string[],
  fullArray: { shapeId: string }[],
) {
  const finalResult = [];
  fullArray.forEach((currentItem) => {
    if (arrIds.includes(currentItem.shapeId)) {
      finalResult.push(currentItem);
    }
  });

  return finalResult;
}

export function findLargestNumber(measurements: { number: number }[]) {
  let largestNumber = 0;

  measurements.forEach((item) => {
    if (item.number > largestNumber) {
      largestNumber = item.number;
    }
  });

  return largestNumber;
}
