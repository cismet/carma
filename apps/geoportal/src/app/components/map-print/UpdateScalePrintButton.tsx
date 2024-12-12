import { faArrowsAlt } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { CSSProperties, useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import {
  changeIfMapPrinted,
  changeRedrawPreview,
  getRedrawPreview,
} from "../../store/slices/print";

const UpdateScalePrintButton = ({
  fontSize = "24px",
  hide = false,
  smallMode = false,
  previewWidth,
  previewHight,
}) => {
  const dispatch = useDispatch();
  const redrawPrev = useSelector(getRedrawPreview);
  const hideIcon = parseInt(previewWidth, 10) < 40;
  const normalStyle: CSSProperties = {
    fontSize,
    pointerEvents: "auto",
    transform: "rotate(45deg)",
    cursor: "pointer",
  };

  const smallStyle: CSSProperties = {
    fontSize: "20px ",
    pointerEvents: "auto",
    transform: "rotate(45deg)",
    margin: "auto",
  };

  const updateScaleHandler = () => {
    dispatch(changeIfMapPrinted(false));
    dispatch(changeRedrawPreview(!redrawPrev));
  };

  return (
    <>
      {!hide && !hideIcon && (
        <FontAwesomeIcon
          icon={faArrowsAlt}
          style={smallMode ? smallStyle : normalStyle}
          onClick={updateScaleHandler}
        />
      )}
      {hideIcon && (
        <div
          style={{
            width: previewWidth,
            height: previewHight,
            pointerEvents: "auto",
            cursor: "pointer",
          }}
          onClick={updateScaleHandler}
        ></div>
      )}
    </>
  );
};

export default UpdateScalePrintButton;
