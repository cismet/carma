import type { Store } from "redux";

import {
  useMappingAdapter,
  type MappingPortalState,
} from "./useMappingAdapter";
import { useUiAdapter } from "./useUiAdapter";

export const CarmaApiBridge = ({
  store,
}: {
  store?: Store<MappingPortalState>;
}) => {
  useMappingAdapter(store);
  useUiAdapter();
  return null;
};

export default CarmaApiBridge;
