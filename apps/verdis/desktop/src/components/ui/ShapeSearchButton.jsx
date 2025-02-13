import { Tooltip } from "antd";
import {
  getIfShapeModeAvailable,
  storeShapeMode,
} from "../../store/slices/searchMode";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faMagnifyingGlass } from "@fortawesome/free-solid-svg-icons";
import { useDispatch, useSelector } from "react-redux";

const ShapeSearchButton = () => {
  const dispatch = useDispatch();
  const ifDisable = useSelector(getIfShapeModeAvailable);

  return (
    <Tooltip title="Kassenzeichensuche">
      <div
        className="relative flex cursor-pointer items-center justify-center"
        onClick={() => {
          ifDisable && dispatch(storeShapeMode("rectangle"));
        }}
      >
        <FontAwesomeIcon
          icon={faMagnifyingGlass}
          className={`h-6`}
          style={{
            color: ifDisable ? "black" : "#d3d3d3",
          }}
        />
      </div>
    </Tooltip>
  );
};

export default ShapeSearchButton;
