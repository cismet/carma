import { faArrowsAlt } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { CSSProperties, useEffect } from "react";

// Redux removed: `redrawPrev` is read from props and the redraw is requested by
// calling the `setIfMapPrinted` / `setRedrawPreview` callbacks the parent
// supplies (in the app these dispatch changeIfMapPrinted / changeRedrawPreview).
const UpdateScalePrintButton = ({
  fontSize = "24px",
  hide = false,
  smallMode = false,
  previewWidth,
  previewHight,
  redrawPrev,
  setIfMapPrinted,
  setRedrawPreview,
}) => {
  const hideIcon = parseInt(previewWidth, 10) < 40;
  const normalStyle: CSSProperties = {
    fontSize,
    pointerEvents: "auto",
    transform: "rotate(45deg)",
    cursor: "pointer",
  };

  const smallStyle: CSSProperties = {
    fontSize: "20px ",
    pointerEvents: "auto",
    transform: "rotate(45deg)",
    margin: "auto",
  };

  const updateScaleHandler = () => {
    setIfMapPrinted(false);
    setRedrawPreview(!redrawPrev);
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
