import type { CarmaMapLibreStyleData } from "./maplibre-style.d";
import type {
  AdhocLayerSource,
  AdhocLayerVisibility,
} from "../constants/adhoc";

export type AdhocMapLibreStyleData = CarmaMapLibreStyleData & {
  source?: AdhocLayerSource;
  visibility?: AdhocLayerVisibility;
};
