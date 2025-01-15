import { PROJ4_CONVERTERS } from "@carma-commons/utils";

const { CRS4326, CRS3857 } = PROJ4_CONVERTERS;

export const getWebMercatorInWGS84 = ([x, y]: [number, number]) => {
  const coords = CRS4326.forward(CRS3857.inverse([x, y]));
  return {
    lat: coords[1],
    lon: coords[0],
  };
};
