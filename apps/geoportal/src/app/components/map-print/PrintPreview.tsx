import { useDispatch, useSelector } from "react-redux";
import { PrintPreview as LibPrintPreview } from "@carma-mapping/print-core/leaflet";
import { showPrintErrorToast } from "@carma-mapping/print-core/ui";
import { getUIMode, setUIMode } from "../../store/slices/ui";
import {
  changeIfMapPrinted,
  changeIsLoading,
  changePrintError,
  changeRedrawPreview,
  getDPI,
  getIfMapPrinted,
  getIfPopupOpend,
  getIsLoading,
  getOrientation,
  getPrintName,
  getRedrawPreview,
  getScale,
} from "../../store/slices/print";
import { getBackgroundLayer, getLayers } from "../../store/slices/mapping";

// Thin Redux connector for the print preview. All rendering/behaviour lives in
// the engine-agnostic library component (@carma-mapping/print-core/leaflet);
// this wrapper only maps the geoportal store onto its props and callbacks.
const PrintPreview = () => {
  const dispatch = useDispatch();
  const mode = useSelector(getUIMode);
  const orientation = useSelector(getOrientation);
  const dpi = useSelector(getDPI);
  const ifMapPrinted = useSelector(getIfMapPrinted);
  const printName = useSelector(getPrintName);
  const ifPopupOpened = useSelector(getIfPopupOpend);
  const bgLayer = useSelector(getBackgroundLayer);
  const layers = useSelector(getLayers);
  const loading = useSelector(getIsLoading);
  const scale = useSelector(getScale);
  const redrawPrev = useSelector(getRedrawPreview);

  return (
    <LibPrintPreview
      mode={mode}
      orientation={orientation}
      dpi={dpi}
      ifMapPrinted={ifMapPrinted}
      printName={printName}
      ifPopupOpened={ifPopupOpened}
      bgLayer={bgLayer}
      layers={layers}
      loading={loading}
      scale={scale}
      redrawPrev={redrawPrev}
      setUIMode={(uiMode) => dispatch(setUIMode(uiMode))}
      handleIsLoading={(status) => dispatch(changeIsLoading(status))}
      handleIsError={(status) => {
        showPrintErrorToast(status);
        dispatch(changePrintError(status));
      }}
      setIfMapPrinted={(status) => dispatch(changeIfMapPrinted(status))}
      setRedrawPreview={(status) => dispatch(changeRedrawPreview(status))}
    />
  );
};

export default PrintPreview;
