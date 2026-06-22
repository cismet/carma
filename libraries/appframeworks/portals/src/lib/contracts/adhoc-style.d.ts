import type { CarmaMapLibreStyleData } from "./maplibre-style.d";

// The adhoc-specific `source` and `mapMode` markers live in
// `metadata.carmaConf.layerInfo` (typed on CarmaMapLibreStyleMetadata), so the
// adhoc style data is structurally the same as the base carma style data.
export type AdhocMapLibreStyleData = CarmaMapLibreStyleData;
