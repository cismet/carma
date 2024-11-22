import { faPrint, faXmark } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Button, Radio, Input } from "antd";
import { useState } from "react";
// import "./popover.css";
import type { RadioChangeEvent } from "antd";
import { useDrawRectangle } from "../../hooks/useDrawRectangle";
import {
  getOrientation,
  changeOrientation,
  getDPI,
  changeDPI,
  getPrintName,
  changePrintName,
} from "../../store/slices/print";
import { useSelector, useDispatch } from "react-redux";
import { setUIMode } from "../../store/slices/ui";
import { useOutsideClick } from "../../hooks/useOutsideClick";
import { printMap } from "../../helper/print";

const Print = ({ setShowPrintPopup }) => {
  const dispatch = useDispatch();
  const currentOrient = useSelector(getOrientation);
  const currentDPI = useSelector(getDPI);
  const currentName = useSelector(getPrintName);
  const [orientation, setOrientation] = useState(currentOrient);
  const [scale, setScale] = useState(currentName);
  const [dpi, setDpi] = useState(currentDPI);
  const printInConsoleSettings = () => {
    console.log("xxx orientation", currentOrient);
    console.log("xxx dpi", currentDPI);
    console.log("xxx scale", scale);
  };
  useDrawRectangle(printMap, () => dispatch(setUIMode("default")));
  const printPopupRef = useOutsideClick(() => setShowPrintPopup(false));

  const onChange = (e: RadioChangeEvent) => {
    setOrientation(e.target.value);
    dispatch(changeOrientation(e.target.value));
  };

  return (
    <div className="p-2 flex flex-col gap-3" ref={printPopupRef}>
      <div className="flex items-center gap-2">
        <FontAwesomeIcon icon={faPrint} className="text-xl" />
        <h4 className="mb-0">Drucken</h4>
      </div>
      <h5 className="mb-0">Name</h5>
      <Input
        placeholder={currentName}
        onChange={(e) => {
          setScale(e.target.value);
          dispatch(changePrintName(e.target.value));
        }}
      />
      <hr className="my-0" />

      <h5 className="mb-0">Vorlage</h5>
      <Radio.Group onChange={onChange} value={orientation}>
        <div className="flex items-center gap-1">
          <Radio value={"portrait"}>Hochkant</Radio>
          <Radio value={"landscape"}>Querkant</Radio>
        </div>
      </Radio.Group>

      <hr className="my-0" />
      <h5 className="mb-0">DPI</h5>
      <Radio.Group
        onChange={(e) => {
          setDpi(e.target.value);
          dispatch(changeDPI(e.target.value));
        }}
        value={dpi}
      >
        <div className="flex items-center gap-1">
          <Radio value={"100"}>100</Radio>
          <Radio value={"200"}>200</Radio>
          <Radio value={"300"}>300</Radio>
        </div>
      </Radio.Group>
      <Button
        onClick={() => {
          dispatch(setUIMode("print"));
          setShowPrintPopup(false);
        }}
      >
        Starten
      </Button>
    </div>
  );
};

export default Print;
