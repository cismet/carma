import { useState } from "react";
import { faPrint } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Popover } from "antd";
import { useDispatch, useSelector } from "react-redux";
import { PrintSettings } from "@carma-mapping/print-core/ui";
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
import type { DPI } from "../../store/slices/print";

/**
 * Toolbar print control: a printer button that opens the shared "Drucken"
 * settings panel (@carma-mapping/print-core/ui) wired to the belis print slice.
 *
 * NOTE: the actual preview rectangle + MapFish print job are not wired yet — the
 * "Vorschau" button currently only flips the print slice state and closes the
 * popover. Hooking it to a real preview/print flow is a separate step.
 */
const PrintControl = () => {
  const dispatch = useDispatch();
  const orientation = useSelector(getOrientation);
  const scale = useSelector(getScale);
  const dpi = useSelector(getDPI);
  const redrawPreview = useSelector(getRedrawPreview);
  const [open, setOpen] = useState(false);

  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      trigger="click"
      placement="bottomRight"
      content={
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
            dispatch(changeRedrawPreview(!redrawPreview));
            dispatch(changeIfMapPrinted(false));
            setOpen(false);
          }}
        />
      }
    >
      <button
        title="Drucken"
        className="flex items-center justify-center w-8 h-8 rounded border border-gray-300 bg-white text-gray-500 hover:bg-gray-50"
      >
        <FontAwesomeIcon icon={faPrint} />
      </button>
    </Popover>
  );
};

export default PrintControl;
