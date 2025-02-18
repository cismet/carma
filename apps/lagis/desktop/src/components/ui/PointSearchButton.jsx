import { Tooltip } from "antd";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faSearchLocation } from "@fortawesome/free-solid-svg-icons";
import { useDispatch } from "react-redux";
import { storeShapeMode } from "../../store/slices/searchMode";

const PointSearchButton = () => {
  const dispatch = useDispatch();
  return (
    <Tooltip title="Flurstücksuche">
      <div
        className="relative flex cursor-pointer items-center justify-center"
        onClick={() => dispatch(storeShapeMode("point"))}
      >
        <FontAwesomeIcon icon={faSearchLocation} className={`h-6`} />
      </div>
    </Tooltip>
  );
};

export default PointSearchButton;
