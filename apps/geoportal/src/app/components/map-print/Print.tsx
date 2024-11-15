import { faShareNodes } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Button, Radio } from "antd";
import { useState } from "react";
// import "./popover.css";
import type { RadioChangeEvent } from "antd";
import { useDrawRectangle } from "../../hooks/useDrawRectangle";

const Print = () => {
  const [orientation, setOrientation] = useState("hochkant");
  const rectangle = useDrawRectangle();
  const onChange = (e: RadioChangeEvent) => {
    console.log("xxx radio checked", e.target.value);
    setOrientation(e.target.value);
  };
  return (
    <div className="p-2 flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <FontAwesomeIcon icon={faShareNodes} className="text-xl" />
        <h4 className="mb-0">Map print</h4>
      </div>
      <Radio.Group onChange={onChange} value={orientation}>
        <div className="flex items-center gap-1">
          <Radio value={"hochkant"}>Hochkant</Radio>
          <Radio value={"querkant"}>Querkant</Radio>
        </div>
      </Radio.Group>
      <hr className="my-0" />

      <Button>Print</Button>
    </div>
  );
};

export default Print;
