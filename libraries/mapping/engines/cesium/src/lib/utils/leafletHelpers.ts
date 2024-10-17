// TODO MOVE TO COMMON HELPER LIBRARY IF TESTED AND NEEDED ELSEWHERE

export const isLeafletZoomValid = (zoom: number) => {
  if (
    zoom === undefined ||
    Number.isNaN(zoom) ||
    zoom === Infinity ||
    zoom === -Infinity
  ) {
    return false;
  } else {
    return true;
  }
};
