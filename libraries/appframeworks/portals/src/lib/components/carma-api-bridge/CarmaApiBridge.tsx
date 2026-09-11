import type { Store } from "redux";

import {
  useMappingAdapter,
  type MappingPortalState,
} from "./useMappingAdapter";
import { useUiAdapter } from "./useUiAdapter";
import { useGazetteerAdapter } from "./useGazetteerAdapter";
import { useNukeAdapter } from "./useNukeAdapter";

export const CarmaApiBridge = ({
  store,
}: {
  store?: Store<MappingPortalState>;
}) => {
  useMappingAdapter(store);
  useUiAdapter();
  useGazetteerAdapter();
  useNukeAdapter(store);
  return null;
};

export default CarmaApiBridge;
