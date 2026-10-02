import ColorHash from "color-hash";

export const POI_COLORS_URL =
  "https://wupp-topicmaps-data.cismet.de/data/poi.farben.json";

// Same fallback as the Leaflet Stadtplan for combinations without a defined color
const colorHash = new ColorHash({ saturation: 0.3 });

/** poiColors keys are lebenslage combinations, sorted alphabetically */
export function getColorForCombination(
  combination: string,
  poiColors: Record<string, string>
): string {
  return poiColors[combination] || colorHash.hex(combination);
}
