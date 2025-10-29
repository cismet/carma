import { BackgroundLayer, Layer } from "../../../../../types/src/index.ts";
import { GeoportalCollection } from "../types";
interface SaveProps {
  layers: Layer[];
  backgroundLayer: BackgroundLayer;
  storeConfigAction: (config: GeoportalCollection) => void;
  closePopover?: () => void;
}
export declare const Save: ({
  layers,
  backgroundLayer,
  storeConfigAction,
  closePopover,
}: SaveProps) => import("react/jsx-runtime").JSX.Element;
export default Save;
