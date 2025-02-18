import { Tooltip } from "antd";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faSearchLocation } from "@fortawesome/free-solid-svg-icons";
import { useDispatch } from "react-redux";
import { storeShapeMode } from "../../store/slices/searchMode";

const PointSearchButton = () => {
  const dispatch = useDispatch();
  return (
    <FontAwesomeIcon
      icon={faSearchLocation}
      className="text-lg h-5"
      onClick={() => dispatch(storeShapeMode("point"))}
    />
  );
};

export default PointSearchButton;
