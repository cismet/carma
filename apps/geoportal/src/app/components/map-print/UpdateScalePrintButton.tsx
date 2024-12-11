import { faArrowsAlt } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { CSSProperties, useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import {
  changeRedrawPreview,
  getRedrawPreview,
} from "../../store/slices/print";

const UpdateScalePrintButton = ({
  // updateScaleHandler,
  fontSize = "24px",
  hide = false,
  smallMode = false,
  previewWidth,
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
    </>
  );
};

export default UpdateScalePrintButton;
