import { ServiceOption } from "../../../../../resources/src/index.ts";
import { LayerState } from "../types";
import { SelectionItem } from "./SelectionProvider";
export type ShareProps = {
  layerState: LayerState;
  selection?: SelectionItem;
  closePopover?: () => void;
  showExtendedSharing?: boolean;
  jwt?: string;
  apiUrl?: string;
  serviceOptions?: ServiceOption[];
};
export declare const Share: ({
  layerState,
  closePopover,
  selection,
  showExtendedSharing,
  jwt,
  apiUrl,
  serviceOptions,
}: ShareProps) => import("react/jsx-runtime").JSX.Element;
export default Share;
