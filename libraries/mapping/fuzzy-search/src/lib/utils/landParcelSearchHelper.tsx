import Fuse from "fuse.js";
import proj4 from "proj4";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faDrawPolygon } from "@fortawesome/free-solid-svg-icons";
import { GroupedOptions } from "../..";
import type { SearchResultItem } from "@carma/types";

export const LAND_PARCEL_SEPARATOR = "-";

export type FlurstueckEntry = {
  label?: string;
  alkis_id?: string;
  x?: number;
  y?: number;
  bounds?: number[];
  lfk?: string | number;
  art?: string;
  hist?: boolean;
};

export type FlurEntry = {
  flur: string;
  flurstuecke: Record<string, FlurstueckEntry>;
};

export type GemarkungEntry = {
  gemarkung: string;
  flure: Record<string, FlurEntry>;
};

export type LandParcelDataStructure = Record<string, GemarkungEntry>;

const LandParcelLabel = ({ text }: { text: string }) => (
  <div style={{ paddingLeft: "0.3rem" }}>
    <span style={{ marginRight: "0.4rem" }}>
      <FontAwesomeIcon icon={faDrawPolygon} />
    </span>
    <span>{text}</span>
  </div>
);

export type LandParcelParseState =
  | { stage: "none" }
  | {
      stage: "gemarkung_matched";
      gemarkungKey: string;
      gemarkungName: string;
      gemarkungDisplay: string;
      flurFilter: string;
    }
  | {
      stage: "flur_matched";
      gemarkungKey: string;
      gemarkungName: string;
      gemarkungDisplay: string;
      flurKey: string;
      flurName: string;
      fstckFilter: string;
    };

const removeLeadingZeros = (numberStr: string, flur = false): string => {
  if (!numberStr) return "";
  const parts = numberStr.split("/");
  const trimmedParts = parts.map((part) => {
    let startIndex = 0;
    while (startIndex < part.length && part[startIndex] === "0") {
      startIndex++;
    }
    return part.substring(startIndex) || "0";
  });

  const flurResult = trimmedParts.join("/");
  const result =
    trimmedParts.length > 1
      ? trimmedParts.join("/")
      : trimmedParts.join("") + "/0";

  return !flur ? result : flurResult;
};

const findGemarkungByNameOrKey = (
  input: string,
  data: LandParcelDataStructure
): { key: string; entry: GemarkungEntry } | null => {
  const normalized = input.trim().toLowerCase();
  for (const key of Object.keys(data)) {
    if (
      data[key].gemarkung.toLowerCase() === normalized ||
      key === normalized
    ) {
      return { key, entry: data[key] };
    }
  }
  return null;
};

const findFlurByInput = (
  input: string,
  flure: Record<string, FlurEntry>
): { key: string; entry: FlurEntry } | null => {
  const normalized = input.trim();
  for (const key of Object.keys(flure)) {
    const flurClean = removeLeadingZeros(flure[key].flur, true);
    if (flurClean === normalized) {
      return { key, entry: flure[key] };
    }
  }
  return null;
};

export const parseLandParcelInput = (
  value: string,
  data: LandParcelDataStructure
): LandParcelParseState => {
  const segments = value.split(LAND_PARCEL_SEPARATOR);
  if (segments.length < 2) {
    return { stage: "none" };
  }

  const gemarkungInput = segments[0].trim();
  const match = findGemarkungByNameOrKey(gemarkungInput, data);
  if (!match) {
    return { stage: "none" };
  }

  const gemarkungDisplay = /^\d+$/.test(gemarkungInput)
    ? match.key
    : match.entry.gemarkung;

  if (segments.length === 2) {
    return {
      stage: "gemarkung_matched",
      gemarkungKey: match.key,
      gemarkungName: match.entry.gemarkung,
      gemarkungDisplay,
      flurFilter: segments[1].trim(),
    };
  }

  // 3+ segments: try to match flur
  const flurInput = segments[1].trim();
  const flurMatch = findFlurByInput(flurInput, match.entry.flure);
  if (!flurMatch) {
    // Flur not found, stay at gemarkung stage with the flur filter
    return {
      stage: "gemarkung_matched",
      gemarkungKey: match.key,
      gemarkungName: match.entry.gemarkung,
      gemarkungDisplay,
      flurFilter: flurInput,
    };
  }

  return {
    stage: "flur_matched",
    gemarkungKey: match.key,
    gemarkungName: match.entry.gemarkung,
    gemarkungDisplay,
    flurKey: flurMatch.key,
    flurName: removeLeadingZeros(flurMatch.entry.flur, true),
    fstckFilter: segments[2].trim(),
  };
};

export const normalizeLandParcelInput = (input: string): string | null => {
  const cleaned = input.trim().replace(/_/g, "0");

  // Already in our separator format
  if (cleaned.includes(LAND_PARCEL_SEPARATOR)) return cleaned;

  const digitsOnly = cleaned.replace(/\D/g, "");

  // 20-char ALKIS format with 05 prefix: 05(2) + gem(4) + flur(3) + zähler(5) + nenner(4) + padding(2)
  if (digitsOnly.length >= 18 && digitsOnly.startsWith("05")) {
    const gem = digitsOnly.substring(2, 6);
    const flur = digitsOnly.substring(6, 9);
    const zaehler = digitsOnly.substring(9, 14);
    const nenner = digitsOnly.substring(14, 18);
    return `${gem}${LAND_PARCEL_SEPARATOR}${removeLeadingZeros(
      flur,
      true
    )}${LAND_PARCEL_SEPARATOR}${removeLeadingZeros(`${zaehler}/${nenner}`)}`;
  }

  // 16-char compact format: gem(4) + flur(4) + zähler(4) + nenner(4)
  if (digitsOnly.length === 16) {
    const gem = digitsOnly.substring(0, 4);
    const flur = digitsOnly.substring(4, 8);
    const zaehler = digitsOnly.substring(8, 12);
    const nenner = digitsOnly.substring(12, 16);
    return `${gem}${LAND_PARCEL_SEPARATOR}${removeLeadingZeros(
      flur,
      true
    )}${LAND_PARCEL_SEPARATOR}${removeLeadingZeros(`${zaehler}/${nenner}`)}`;
  }

  return null;
};

export const tryDirectLandParcelMatch = (
  value: string,
  data: LandParcelDataStructure
): GroupedOptions[] | null => {
  const normalized = normalizeLandParcelInput(value);
  if (!normalized) return null;

  const segments = normalized.split(LAND_PARCEL_SEPARATOR);
  if (segments.length < 3) return null;

  const gemarkungInput = segments[0].trim();
  const flurInput = segments[1].trim();
  const fstckInput = segments.slice(2).join(LAND_PARCEL_SEPARATOR).trim();

  if (!gemarkungInput || !flurInput || !fstckInput) return null;

  const gemarkung = findGemarkungByNameOrKey(gemarkungInput, data);
  if (!gemarkung) return null;

  const flur = findFlurByInput(flurInput, gemarkung.entry.flure);
  if (!flur) return null;

  const normalizedInput = removeLeadingZeros(fstckInput);
  const matchingEntries = Object.entries(flur.entry.flurstuecke).filter(
    ([key, fstck]) => removeLeadingZeros(fstck.label ?? key) === normalizedInput
  );

  if (matchingEntries.length === 0) return null;

  const flurName = removeLeadingZeros(flur.entry.flur, true);
  const gemarkungDisplay = /^\d+$/.test(gemarkungInput)
    ? gemarkung.key
    : gemarkung.entry.gemarkung;

  const options = matchingEntries.map(([key, fstck], idx) => {
    const displayLabel = removeLeadingZeros(fstck.label ?? key);
    return {
      key: idx,
      label: (
        <LandParcelLabel
          text={`${gemarkungDisplay}-${flurName}-${displayLabel}`}
        />
      ),
      value: `${gemarkungDisplay}${LAND_PARCEL_SEPARATOR}${flurName}${LAND_PARCEL_SEPARATOR}${displayLabel}`,
      sData: null as any,
      isLandParcel: true,
      parcelStage: "flurstueck" as const,
      parcelData: {
        gemarkung: gemarkung.entry.gemarkung,
        flur: flurName,
        ...fstck,
      },
    };
  });

  const title = `Flurstücke in ${gemarkung.entry.gemarkung}, Flur ${flurName}`;
  return [
    {
      label: <span data-title="category-title">{title}</span>,
      options,
      titleText: title,
    },
  ];
};

export const generateGemarkungOptions = (
  filter: string,
  data: LandParcelDataStructure
): GroupedOptions[] => {
  const trimmed = filter.trim();

  const items = Object.keys(data).map((key) => ({
    key,
    name: data[key].gemarkung,
  }));

  let orderedItems: typeof items;
  let isKeySearch = false;

  if (trimmed === "") {
    orderedItems = items.sort((a, b) => a.key.localeCompare(b.key));
  } else {
    isKeySearch = /^\d+$/.test(trimmed);
    const fuse = new Fuse(items, {
      keys: ["name", "key"],
      threshold: 0.4,
      distance: 100,
      includeScore: true,
    });
    orderedItems = fuse.search(trimmed).map((r) => r.item);
  }

  const matches = orderedItems.map(({ key, name }, idx) => {
    const displayId = isKeySearch ? key : name;
    return {
      key: idx,
      label: <LandParcelLabel text={`${key} (${name})`} />,
      value: `${displayId}${LAND_PARCEL_SEPARATOR}`,
      sData: null as any,
      isLandParcel: true,
      parcelStage: "gemarkung" as const,
    };
  });

  if (matches.length === 0) return [];

  const title = "Gemarkungen";
  return [
    {
      label: <span data-title="category-title">{title}</span>,
      options: matches,
      titleText: title,
    },
  ];
};

export const generateLandParcelOptions = (
  parseState: LandParcelParseState,
  data: LandParcelDataStructure
): GroupedOptions[] => {
  if (parseState.stage === "none") return [];

  if (parseState.stage === "gemarkung_matched") {
    const gemarkung = data[parseState.gemarkungKey];
    const filter = parseState.flurFilter.toLowerCase();

    const allFlure = Object.keys(gemarkung.flure).map((key) => {
      const flur = gemarkung.flure[key];
      const flurLabel = removeLeadingZeros(flur.flur, true);
      return { key, flur, flurLabel };
    });

    let filteredFlure: typeof allFlure;
    if (filter === "") {
      filteredFlure = allFlure.sort(
        (a, b) => parseInt(a.flurLabel, 10) - parseInt(b.flurLabel, 10)
      );
    } else {
      const fuse = new Fuse(allFlure, {
        keys: ["flurLabel"],
        threshold: 0.4,
        distance: 50,
        includeScore: true,
      });
      filteredFlure = fuse.search(filter).map((r) => r.item);
    }

    const flurOptions = filteredFlure.map(({ flurLabel }, idx) => ({
      key: idx,
      label: (
        <LandParcelLabel text={`${parseState.gemarkungDisplay}-${flurLabel}`} />
      ),
      value: `${parseState.gemarkungDisplay}${LAND_PARCEL_SEPARATOR}${flurLabel}${LAND_PARCEL_SEPARATOR}`,
      sData: null as any,
      isLandParcel: true,
      parcelStage: "flur" as const,
    }));

    const title = `Fluren in ${parseState.gemarkungName}`;
    return [
      {
        label: <span data-title="category-title">{title}</span>,
        options: flurOptions,
        titleText: title,
      },
    ];
  }

  if (parseState.stage === "flur_matched") {
    const gemarkung = data[parseState.gemarkungKey];
    const flurEntry = gemarkung.flure[parseState.flurKey];
    const filter = parseState.fstckFilter.toLowerCase();

    const allFstck = Object.keys(flurEntry.flurstuecke).map((key) => {
      const fstck = flurEntry.flurstuecke[key];
      const displayLabel = removeLeadingZeros(fstck.label ?? key);
      return { key, fstck, displayLabel };
    });

    let filteredFstck: typeof allFstck;
    if (filter === "") {
      filteredFstck = allFstck.sort(
        (a, b) => parseFloat(a.key) - parseFloat(b.key)
      );
    } else {
      const fuse = new Fuse(allFstck, {
        keys: ["displayLabel"],
        threshold: 0.4,
        distance: 50,
        includeScore: true,
      });
      filteredFstck = fuse.search(filter).map((r) => r.item);
    }

    const fstckOptions = filteredFstck.map(
      ({ key, fstck, displayLabel }, idx) => {
        return {
          key: idx,
          label: (
            <LandParcelLabel
              text={`${parseState.gemarkungDisplay}-${parseState.flurName}-${displayLabel}`}
            />
          ),
          value: `${parseState.gemarkungDisplay}${LAND_PARCEL_SEPARATOR}${parseState.flurName}${LAND_PARCEL_SEPARATOR}${displayLabel}`,
          sData: null as any,
          isLandParcel: true,
          parcelStage: "flurstueck" as const,
          parcelData: {
            gemarkung: parseState.gemarkungName,
            flur: parseState.flurName,
            ...fstck,
          },
        };
      }
    );

    const title = `Flurstücke in ${parseState.gemarkungName}, Flur ${parseState.flurName}`;
    return [
      {
        label: <span data-title="category-title">{title}</span>,
        options: fstckOptions,
        titleText: title,
      },
    ];
  }

  return [];
};

export const parseLandparcelToSelectionItem = (option) => {
  const parcel = option.parcelData;
  if (!parcel?.x || !parcel?.y) {
    return null;
  }
  const bounds = parcel.bounds;
  const toMercator = (coords: number[]) =>
    proj4("EPSG:4326", "EPSG:3857", coords);
  const [x3857, y3857] = toMercator([parcel.x, parcel.y]);
  const boundsCoords = bounds
    ? (() => {
        const bl = toMercator([bounds[0], bounds[1]]);
        const br = toMercator([bounds[2], bounds[1]]);
        const tr = toMercator([bounds[2], bounds[3]]);
        const tl = toMercator([bounds[0], bounds[3]]);
        return [[bl, br, tr, tl, bl]];
      })()
    : [];
  const selectionItem: SearchResultItem = {
    x: x3857,
    y: y3857,
    crs: "3857",
    string: option.value,
    glyph: "draw-polygon",
    type: "flurstuecke",
    sorter: Date.now(),
    xSearchData: option.value,
    semanticIdentifier: "landparcel",
    more: {
      g: {
        type: "Polygon",
        coordinates: boundsCoords,
      },
    },
  };

  return selectionItem;
};
