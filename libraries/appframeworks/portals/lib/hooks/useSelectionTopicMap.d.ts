import { Map } from "leaflet";
import { SelectionItem } from "../components/SelectionProvider";
type SelectionTopicMapOptions = {
  onComplete?: (selection: SelectionItem, map: Map) => void;
};
export declare const useSelectionTopicMap: ({
  onComplete,
}?: SelectionTopicMapOptions) => void;
export {};
