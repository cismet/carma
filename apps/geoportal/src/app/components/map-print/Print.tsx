import { faPrint, faShareNodes } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Button, Radio, Input } from "antd";
import { useEffect, useState } from "react";
// import "./popover.css";
import type { RadioChangeEvent } from "antd";
import { useDrawRectangle } from "../../hooks/useDrawRectangle";
import { getOrientation, changeOrientation } from "../../store/slices/print";
import { useSelector, useDispatch } from "react-redux";
import { setUIMode } from "../../store/slices/ui";

const Print = ({ setShowPrintPopup }) => {
  const dispatch = useDispatch();
  const currentOrient = useSelector(getOrientation);
  const [orientation, setOrientation] = useState(currentOrient);
  const [scale, setScale] = useState("4000");
  const [dpi, setDpi] = useState("100");
  useDrawRectangle();

  const onChange = (e: RadioChangeEvent) => {
    setOrientation(e.target.value);
    dispatch(changeOrientation(e.target.value));
  };

  return (
    <div className="p-2 flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <FontAwesomeIcon icon={faPrint} className="text-xl" />
        <h4 className="mb-0">Drucken</h4>
      </div>
      <h5 className="mb-0">Vorlage</h5>
      <Radio.Group onChange={onChange} value={orientation}>
        <div className="flex items-center gap-1">
          <Radio value={"portrait"}>Hochkant</Radio>
          <Radio value={"landscape"}>Querkant</Radio>
        </div>
      </Radio.Group>
      <hr className="my-0" />

      <h5 className="mb-0">Maßstab</h5>
      <Input placeholder="4000" onChange={(e) => setScale(e.target.value)} />
      <hr className="my-0" />
      <h5 className="mb-0">DPI</h5>
      <Radio.Group onChange={(e) => setDpi(e.target.value)} value={dpi}>
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
