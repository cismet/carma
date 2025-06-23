import { MapStyleKeys } from "./mapStyleConfig";

// todo: make default / generic helper for this for lib

type cesiumKeys = "primary" | "secondary";

const mapStyleShortNames: Record<MapStyleKeys, string> = {
  [MapStyleKeys.TOPO]: "0",
  [MapStyleKeys.AERIAL]: "1",
};

const mapStyleLUT = Object.fromEntries(
  Object.entries(mapStyleShortNames).map(([key, value]) => [value, key])
);

const cesiumMapStyleShortNames: Record<cesiumKeys, string> = {
  primary: "0",
  secondary: "1",
};

const cesiumMapStyleLUT = Object.fromEntries(
  Object.entries(cesiumMapStyleShortNames).map(([key, value]) => [value, key])
);

export const hashStateConfig = {
  aliases: { mapStyle: "m", cesiumMapStyle: "m", zoom: "z" },
  codecs: {
    mapStyle: {
      encode: (value: MapStyleKeys) => mapStyleShortNames[value],
      decode: (value: string) => mapStyleLUT[value],
    },
    cesiumMapStyle: {
      encode: (value: cesiumKeys) => cesiumMapStyleShortNames[value],
      decode: (value: string) => cesiumMapStyleLUT[value],
    },
    lat: {
      encode: (value: number) => value.toFixed(7),
      decode: (value: string) => parseFloat(value),
    },
    lng: {
      encode: (value: number) => value.toFixed(7),
      decode: (value: string) => parseFloat(value),
    },
    zoom: {
      encode: (value: number) => parseFloat(value.toFixed(2)).toString(),
      decode: (value: string) => parseFloat(value),
    },
  },
};
