import Fuse from "fuse.js";
import { GroupedOptions } from "../..";

export const LAND_PARCEL_SEPARATOR = "-";

export type FlurstueckEntry = {
  label: string;
  lfk?: string;
  alkis_id?: string;
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

export type LandParcelParseState =
  | { stage: "none" }
  | {
      stage: "gemarkung_matched";
      gemarkungKey: string;
      gemarkungName: string;
      flurFilter: string;
    }
  | {
      stage: "flur_matched";
      gemarkungKey: string;
      gemarkungName: string;
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

  if (segments.length === 2) {
    return {
      stage: "gemarkung_matched",
      gemarkungKey: match.key,
      gemarkungName: match.entry.gemarkung,
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
      flurFilter: flurInput,
    };
  }

  return {
    stage: "flur_matched",
    gemarkungKey: match.key,
    gemarkungName: match.entry.gemarkung,
    flurKey: flurMatch.key,
    flurName: removeLeadingZeros(flurMatch.entry.flur, true),
    fstckFilter: segments[2].trim(),
  };
};

export const generateGemarkungOptions = (
  filter: string,
  data: LandParcelDataStructure
): GroupedOptions[] => {
  const trimmed = filter.trim();
  if (trimmed === "") return [];

  const items = Object.keys(data).map((key) => ({
    key,
    name: data[key].gemarkung,
  }));
  const fuse = new Fuse(items, {
    keys: ["name", "key"],
    threshold: 0.4,
    distance: 100,
    includeScore: true,
  });
  const results = fuse.search(trimmed);

  const matches = results.map(({ item: { name } }, idx) => ({
    key: idx,
    label: (
      <div style={{ paddingLeft: "0.3rem" }}>
        <span style={{ marginRight: "0.4rem" }}>
          <i className="fas fa-map"></i>
        </span>
        <span>{name}</span>
      </div>
    ),
    value: `${name}${LAND_PARCEL_SEPARATOR}`,
    sData: null as any,
    isLandParcel: true,
    parcelStage: "gemarkung" as const,
  }));

  if (matches.length === 0) return [];

  return [
    {
      label: <span data-title="category-title">Gemarkung</span>,
      options: matches,
      titleText: "Gemarkung",
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
        <div style={{ paddingLeft: "0.3rem" }}>
          <span style={{ marginRight: "0.4rem" }}>
            <i className="fas fa-layer-group"></i>
          </span>
          <span>
            {parseState.gemarkungName}-{flurLabel}
          </span>
        </div>
      ),
      value: `${parseState.gemarkungName}${LAND_PARCEL_SEPARATOR}${flurLabel}${LAND_PARCEL_SEPARATOR}`,
      sData: null as any,
      isLandParcel: true,
      parcelStage: "flur" as const,
    }));

    const title = `Flur (${parseState.gemarkungName})`;
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
      const displayLabel = removeLeadingZeros(fstck.label);
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
            <div style={{ paddingLeft: "0.3rem" }}>
              <span style={{ marginRight: "0.4rem" }}>
                <i
                  className={
                    fstck.art === "städtisch"
                      ? "fas fa-university"
                      : "fas fa-vector-square"
                  }
                ></i>
              </span>
              <span>
                {parseState.gemarkungName}-{parseState.flurName}-{displayLabel}
              </span>
            </div>
          ),
          value: `${parseState.gemarkungName}${LAND_PARCEL_SEPARATOR}${parseState.flurName}${LAND_PARCEL_SEPARATOR}${displayLabel}`,
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

    return [
      {
        label: (
          <span data-title="category-title">
            Flurstück ({parseState.gemarkungName}, Flur {parseState.flurName})
          </span>
        ),
        options: fstckOptions,
        titleText: `Flurstück (${parseState.gemarkungName}, Flur ${parseState.flurName})`,
      },
    ];
  }

  return [];
};
