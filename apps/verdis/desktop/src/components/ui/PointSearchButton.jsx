import { Tooltip } from "antd";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faMagnifyingGlass,
  faMagnifyingGlassLocation,
} from "@fortawesome/free-solid-svg-icons";
import { useDispatch, useSelector } from "react-redux";
import { getJWT } from "../../store/slices/auth";
import { storeShapeMode } from "../../store/slices/searchMode";

const PointSearchButton = () => {
  const dispatch = useDispatch();
  return (
    <Tooltip title="Kassenzeichen-Suche">
      <div
        className="relative flex cursor-pointer items-center justify-center"
        onClick={() => dispatch(storeShapeMode("point"))}
      >
        <FontAwesomeIcon icon={faMagnifyingGlassLocation} className={`h-6`} />
      </div>
    </Tooltip>
  );
};

export default PointSearchButton;
