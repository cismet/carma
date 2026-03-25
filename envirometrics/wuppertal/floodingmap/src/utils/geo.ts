import { PROJ4_CONVERTERS } from "@carma-commons/utils";

const { CRS4326, CRS3857 } = PROJ4_CONVERTERS;

export const getWGS84InWebMercator = ({
  lat,
  lon,
}: {
  lat: number;
  lon: number;
}) => {
  const coords = CRS3857.forward(CRS4326.inverse([lon, lat]));
  return {
    x: coords[0],
    y: coords[1],
  };
};

export const getWebMercatorInWGS84 = ([x, y]: [number, number]) => {
  const coords = CRS4326.forward(CRS3857.inverse([x, y]));
  return {
    lat: coords[1],
    lon: coords[0],
  };
};
