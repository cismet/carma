import type { LeerstandPhoto, LeerstandProperties } from "./leerstandApi";
import type { NearbyAddress } from "./locationInfo";

/** attributes of an ALKIS building as delivered by the vector tiles */
export interface BuildingInfo {
  /** ALKIS object id, e.g. DENW29AL1000GXa6 */
  alkisId: string;
  /** "Hauptgebäude" or "Nebengebäude" (ALKIS geb_typ, trimmed) */
  typ: string | null;
  funktion: string | null;
  geschosseOberirdisch: number | null;
  /** first address of the building, e.g. "Wall 1" */
  mainAddress: string | null;
  /** number of addresses attached to the building */
  addressCount: number;
  /** footprint in m² */
  grundflaeche: number | null;
}

const asNumber = (value: unknown): number | null => {
  if (typeof value === "number" && !isNaN(value)) return value;
  if (typeof value === "string" && value.trim() !== "" && !isNaN(Number(value))) {
    return Number(value);
  }
  return null;
};

const asText = (value: unknown): string | null => {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text === "" ? null : text;
};

export const buildingInfoFromProperties = (
  props: Record<string, unknown>
): BuildingInfo | undefined => {
  const alkisId = asText(props.id);
  if (!alkisId) return undefined;
  return {
    alkisId,
    typ: asText(props.geb_typ),
    funktion: asText(props.geb_fkt),
    geschosseOberirdisch: asNumber(props.og_geschosse),
    mainAddress: asText(props.main_address),
    addressCount: asNumber(props.anz_adress) ?? (props.main_address ? 1 : 0),
    grundflaeche: asNumber(props.flaeche),
  };
};

/**
 * MapLibre hands GeoJSON properties back with nested values serialised, so
 * the photo list arrives as a JSON string and nulls as "null". Normalises
 * the object in place.
 */
export const parseLeerstandProperties = (
  props: Record<string, unknown>
): LeerstandProperties => {
  // null values come back as the string "null" from the tile encoding
  for (const key of Object.keys(props)) {
    if (props[key] === "null" || props[key] === "undefined") props[key] = null;
  }
  if (typeof props.fotos === "string") {
    try {
      props.fotos = JSON.parse(props.fotos);
    } catch {
      props.fotos = [];
    }
  }
  if (!Array.isArray(props.fotos)) props.fotos = [];
  return props as unknown as LeerstandProperties;
};

const formatDate = (value: string | null | undefined) => {
  if (!value) return "";
  const d = new Date(value);
  return isNaN(d.getTime()) ? value : d.toLocaleDateString("de-DE");
};

const photoCaption = (photo: LeerstandPhoto) =>
  [photo.artName, photo.beschreibung].filter(Boolean).join(" · ");

/** info box control object for a stored Leerstand, see tzb createInfoBoxControlObject */
export const createLeerstandInfoBoxControlObject = (
  properties: LeerstandProperties
) => {
  const puretitle = properties.nutzungsart
    ? `Leerstand: ${properties.nutzungsart}`
    : `Leerstand ${properties.id}`;
  const details = [
    properties.flaechengroesse != null ? `${properties.flaechengroesse} m²` : null,
    properties.geschosse != null ? `${properties.geschosse} Geschosse` : null,
    properties.zus_adressangabe,
  ].filter(Boolean);
  const fotos = properties.fotos.map((f) => f.link);

  return {
    headerColor: "#c62828",
    header: "Leerstand",
    puretitle,
    title: "<html><h3>" + puretitle + "</html>",
    subtitle: details.join(" · "),
    additionalInfo: `erfasst von ${properties.erfasser ?? "?"} am ${formatDate(
      properties.erfassungsdatum
    )}`,
    modal: true,
    foto: fotos[0],
    fotos: fotos.length > 0 ? fotos : undefined,
    fotoCaptions: fotos.length > 0 ? properties.fotos.map(photoCaption) : undefined,
  };
};

/**
 * info box control object for a tapped ALKIS building. Same layout as the
 * ALKIS info box of the geoportal: header = Gebäudetyp, title = Adresse,
 * body = Funktion and Grundfläche. `modal: true` adds the info button that
 * opens the ALKIS datasheet (collab AlkisSIM); the plus link opens the
 * capture dialog.
 */
export const createBuildingInfoBoxControlObject = (
  building: BuildingInfo,
  onErfassen: () => void
) => {
  const puretitle = building.mainAddress ?? "Gebäude ohne Adresse";
  const lines = [
    `Funktion: ${building.funktion ?? "-"}`,
    building.grundflaeche != null
      ? `Grundfläche: ${building.grundflaeche} m²`
      : null,
  ].filter(Boolean);

  return {
    header: building.typ ?? "Gebäude",
    puretitle,
    title: "<html><h3>" + puretitle + "</h3></html>",
    subtitle: lines.join("\n"),
    modal: true,
    genericLinks: [
      {
        action: onErfassen,
        tooltip: "Leerstand in diesem Gebäude erfassen",
        iconname: "plus-square",
      },
    ],
  };
};

/** nearest address of a free point: still loading, none in the search window, lookup failed, or found */
export type NearestAddress = NearbyAddress | "loading" | "none" | "failed";

const nearestAddressLine = (nearest: NearestAddress) => {
  if (nearest === "loading") return "Nächste Adresse wird ermittelt …";
  if (nearest === "none") return "Keine Adresse in der Nähe gefunden";
  if (nearest === "failed") return "Nächste Adresse konnte nicht ermittelt werden";
  return `Nächste Adresse: ${`${nearest.street} ${nearest.number}`.trim()}, ${Math.round(
    nearest.distance
  )} m entfernt`;
};

/**
 * info box control object for a tap on open ground. No datasheet behind it,
 * so no `modal`; the plus link opens the capture dialog without a building.
 */
export const createFreePointInfoBoxControlObject = (
  nearest: NearestAddress,
  onErfassen: () => void
) => {
  const puretitle = "Kein ALKIS-Gebäude an dieser Stelle";

  return {
    headerColor: "#8a4708",
    header: "Freier Punkt",
    puretitle,
    title: "<html><h3>" + puretitle + "</h3></html>",
    subtitle: nearestAddressLine(nearest),
    genericLinks: [
      {
        action: onErfassen,
        tooltip: "Leerstand an diesem Punkt erfassen",
        iconname: "plus-square",
      },
    ],
  };
};
