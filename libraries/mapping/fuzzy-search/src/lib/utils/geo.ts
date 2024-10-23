import proj4 from "proj4";

export const PROJ4_CONVERTERS = {
  CRS25832: proj4("+proj=utm +zone=32 +ellps=GRS80 +units=m +no_defs"),
  CRS4326: proj4("EPSG:4326"),
};

export const isProj4Converter = (
  obj:
    | {
        forward?: unknown;
        inverse?: unknown;
      }
    | string,
): obj is proj4.Converter => {
  return (
    typeof obj !== "string" &&
    typeof obj.forward === "function" &&
    typeof obj.inverse === "function"
  );
};

export function convertBBox2Bounds(
  bbox: [number, number, number, number],
  refDef = PROJ4_CONVERTERS.CRS4326,
) {
  const projectedNE = PROJ4_CONVERTERS.CRS4326.forward(
    refDef.inverse([bbox[0], bbox[1]]),
  );
  const projectedSW = PROJ4_CONVERTERS.CRS4326.forward(
    refDef.inverse([bbox[2], bbox[3]]),
  );
  return [
    [projectedNE[1], projectedSW[0]],
    [projectedSW[1], projectedNE[0]],
  ];
}
