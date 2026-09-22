import { useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Popover, Tooltip } from "antd";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPrint } from "@fortawesome/free-solid-svg-icons";
import { PrintSettings } from "@carma-mapping/print-core/ui";

import {
  getDPI,
  getOrientation,
  getPrintActive,
  getRedrawPreview,
  getScale,
  setDPI,
  setIfMapPrinted,
  setOrientation,
  setPrintActive,
  setRedrawPreview,
  setScale,
} from "../../store/slices/print";

/**
 * Print control in the map card header: opens the shared settings panel
 * (@carma-mapping/print-core/ui) and activates the print rectangle rendered by
 * the MapLibrePrintPreview in Map.jsx. The dot marks and closes an active
 * preview, like the other map toggles.
 */
const PrintControl = () => {
  const dispatch = useDispatch();
  const orientation = useSelector(getOrientation);
  const scale = useSelector(getScale);
  const dpi = useSelector(getDPI);
  const redrawPreview = useSelector(getRedrawPreview);
  const printActive = useSelector(getPrintActive);
  const [open, setOpen] = useState(false);

  const closePreview = () => {
    dispatch(setPrintActive(false));
  };

  return (
    <div className="relative flex items-center" style={{ height: "24px" }}>
      <Popover
        open={open}
        onOpenChange={setOpen}
        trigger="click"
        placement="bottomRight"
        content={
          // wide enough for the four dpi radios, which do not wrap
          <div style={{ width: "265px" }}>
            <PrintSettings
              orientation={orientation}
              scale={scale}
              dpi={dpi}
              onOrientationChange={(value) => {
                dispatch(setOrientation(value));
                dispatch(setIfMapPrinted(false));
              }}
              onScaleChange={(value) => {
                dispatch(setScale(value));
                dispatch(setIfMapPrinted(false));
              }}
              onDpiChange={(value) => {
                dispatch(setDPI(value));
              }}
              onPreview={() => {
                dispatch(setIfMapPrinted(false));
                dispatch(setRedrawPreview(!redrawPreview));
                dispatch(setPrintActive(true));
                setOpen(false);
              }}
            />
          </div>
        }
      >
        <Tooltip title="Drucken">
          <FontAwesomeIcon
            icon={faPrint}
            style={{ fontSize: "17px" }}
            className="cursor-pointer"
          />
        </Tooltip>
      </Popover>
      <div
        className={`w-3 h-3 rounded-full bg-[#4ABC96] ${
          printActive ? "absolute" : "hidden"
        } bottom-0 -right-1 cursor-pointer`}
        onClick={closePreview}
      />
    </div>
  );
};

export default PrintControl;
