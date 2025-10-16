import { getFromWebMercatorToWGS84 } from "@carma/geo/proj";

export const getWebMercatorInWGS84 = ([x, y]: [number, number]) => {
  const coords = getFromWebMercatorToWGS84([x, y]);
  return {
    lat: coords[1],
    lon: coords[0],
  };
};
