import { SelectionItem } from "../components/SelectionProvider";
import { default as maplibregl } from "maplibre-gl";
type SelectionTopicMapOptions = {
  map?: maplibregl.Map;
  onComplete?: (
    selection: SelectionItem,
    triggerVisibilityChange?: boolean
  ) => void;
};
export declare const useSelectionLibreMap: ({
  map,
  onComplete,
}?: SelectionTopicMapOptions) => void;
export {};
