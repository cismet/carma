import { PositionPreset } from "../positions";

export const WUPPERTAL: PositionPreset = {
  name: "Wuppertal",
  position: {
    latDeg: 51.27174,
    lngDeg: 7.20028,
  },
  height: 155, // Willy Brandt Platz as Reference
  extent: {
    east: 7.32,
    north: 51.33,
    south: 51.16,
    west: 7.0,
  },
};

export default WUPPERTAL;
