import { faShareNodes } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Button, Radio } from "antd";
import { useEffect, useState } from "react";
// import "./popover.css";
import type { RadioChangeEvent } from "antd";
import { useDrawRectangle } from "../../hooks/useDrawRectangle";
import { getUIMode, setUIMode } from "../../store/slices/ui";
import { getOrientation, changeOrientation } from "../../store/slices/print";
import { useSelector, useDispatch } from "react-redux";

const Print = () => {
  const dispatch = useDispatch();
  const currentOrient = useSelector(getOrientation);
  const [orientation, setOrientation] = useState(currentOrient);

  const rectangle = useDrawRectangle();

  const onChange = (e: RadioChangeEvent) => {
    console.log("xxx radio checked", e.target.value);
    setOrientation(e.target.value);
    dispatch(changeOrientation(e.target.value));
  };

  //   useEffect(() => {
  //     dispatch(setUIMode("print"));
  //   }, []);
  return (
    <div className="p-2 flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <FontAwesomeIcon icon={faShareNodes} className="text-xl" />
        <h4 className="mb-0">Map print</h4>
      </div>
      <Radio.Group onChange={onChange} value={orientation}>
        <div className="flex items-center gap-1">
          <Radio value={"portrait"}>Hochkant</Radio>
          <Radio value={"landscape"}>Querkant</Radio>
        </div>
      </Radio.Group>
      <hr className="my-0" />

      <Button>Print</Button>
    </div>
  );
};

export default Print;
