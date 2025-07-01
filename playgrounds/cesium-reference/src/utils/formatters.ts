export const formatDistance = (distance: number): string => {
  if (distance < 1000) {
    return `${distance.toFixed(2)} m`;
  } else {
    return `${(distance / 1000).toFixed(3)} km`;
  }
};
