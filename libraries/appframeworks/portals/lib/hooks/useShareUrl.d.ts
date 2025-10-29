import { LayerState } from "../types";
import { SelectionItem } from "../components/SelectionProvider";
export declare const SHORTENER_URL =
  "https://ceepr.cismet.de/store/wuppertal/_dev_geoportal";
export declare const useShareUrl: () => {
  copyShareUrl: ({
    layerState,
    closePopover,
    selection,
  }: {
    layerState: LayerState;
    closePopover?: () => void;
    selection?: SelectionItem;
  }) => Promise<void>;
  contextHolder: import("react").ReactElement<
    any,
    string | import("react").JSXElementConstructor<any>
  >;
  messageApi: import("antd/es/message/interface").MessageInstance;
};
