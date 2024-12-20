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
  // const ifDisable = useSelector(getIfShapeModeAvailable);
  const jwt = useSelector(getJWT);
  // http://localhost:3033/renderer/?domain=WUNDA_BLAU&jwt={jwt}&table=alkis_landparcel&id={landparcel-id}
  const handleClick = () => {
    const landparcelId = "10";
    const url = `http://localhost:3033/renderer/?domain=WUNDA_BLAU&jwt=${jwt}&table=alkis_landparcel&id=${landparcelId}`;
    window.open(url, "_blank");
  };
  return (
    <Tooltip title="Kassenzeichen-Suche">
      <div
        className="relative flex cursor-pointer items-center justify-center"
        onClick={() => dispatch(storeShapeMode("point"))}
      >
        <FontAwesomeIcon
          icon={faMagnifyingGlassLocation}
          className={`h-6`}
          // style={{
          //   color: ifDisable ? "black" : "#d3d3d3",
          // }}
        />
      </div>
    </Tooltip>
  );
};

export default PointSearchButton;
