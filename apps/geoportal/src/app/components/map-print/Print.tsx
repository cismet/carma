import { useDispatch, useSelector } from "react-redux";
import { PrintSettings, resetPrintErrorCount } from "@carma-mapping/print-core/ui";
import {
  changeDPI,
  changeIfMapPrinted,
  changeOrientation,
  changeRedrawPreview,
  changeScale,
  getDPI,
  getOrientation,
  getRedrawPreview,
  getScale,
} from "../../store/slices/print";
import { setUIMode } from "../../store/slices/ui";

type DPI = "72" | "100" | "200" | "300";

interface PrintProps {
  closePopover?: () => void;
}

// Thin Redux connector for the print settings panel. The presentational,
// Redux-free panel lives in the library (@carma-mapping/print-core/ui); this
// wrapper maps the geoportal store onto its controlled props/callbacks.
const Print = ({ closePopover }: PrintProps) => {
  const dispatch = useDispatch();
  const orientation = useSelector(getOrientation);
  const dpi = useSelector(getDPI);
  const scale = useSelector(getScale);
  const redrawPrev = useSelector(getRedrawPreview);

  return (
    <PrintSettings
      orientation={orientation}
      scale={scale}
      dpi={dpi}
      onOrientationChange={(value) => {
        dispatch(changeOrientation(value));
        dispatch(changeIfMapPrinted(false));
      }}
      onScaleChange={(value) => {
        dispatch(changeScale(value));
        dispatch(changeIfMapPrinted(false));
      }}
      onDpiChange={(value) => {
        dispatch(changeDPI(value as DPI));
      }}
      onPreview={() => {
        // Legacy Leaflet printMap has no onSuccess hook, so we can't reset the
        // toast's failure counter on a successful print. Reset here instead:
        // opening a new preview session starts with a fresh details-gating slate.
        resetPrintErrorCount();
        dispatch(setUIMode("print"));
        dispatch(changeRedrawPreview(!redrawPrev));
        closePopover?.();
        dispatch(changeIfMapPrinted(false));
      }}
    />
  );
};

export default Print;
