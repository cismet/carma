import proj4 from "proj4";
import {
  type ManagedProjectionMap,
  type ManagedDefMap,
  type ManagedProjection,
  ManagedProjections,
} from "./managed-projections";
const Proj4Predefined = ["EPSG:4326", "EPSG:3857"];

export const registerManagedProjections = (
  projections: ManagedProjectionMap,
  defs: ManagedDefMap
) => {
  console.groupCollapsed("Managed projection registration");

  for (const proj of Object.values(projections)) {
    if (Proj4Predefined.includes(proj)) {
      console.debug(`Managed ${proj} is predefined`);
    } else if (defs[proj]) {
      console.debug(`Managed ${proj} registered with definition ${defs[proj]}`);
      proj4.defs(proj, defs[proj]);
    } else {
      console.warn(`No definition found for ${proj}`);
    }
  }
  console.groupEnd();
};

export const normalizeCrsCode = (crsInput: string | number): string => {
  const normalized = String(crsInput).toUpperCase().trim();

  if (normalized.startsWith("EPSG:")) {
    return normalized;
  }

  if (normalized.startsWith("EPSG")) {
    const code = normalized.substring(4);
    return `EPSG:${code}`;
  }

  return `EPSG:${normalized}`;
};

export const getManagedCrs = (crsInput: string | number): ManagedProjection => {
  const epsgCode = normalizeCrsCode(crsInput);
  const managedCrs = Object.values(ManagedProjections).find(
    (crs) => crs === epsgCode
  );
  if (!managedCrs) {
    throw new Error(
      `Unsupported CRS: ${epsgCode}. Only managed projections are supported: ${Object.values(
        ManagedProjections
      ).join(", ")}`
    );
  }
  return managedCrs;
};
