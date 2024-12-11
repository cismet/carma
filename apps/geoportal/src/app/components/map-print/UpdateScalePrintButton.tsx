import { faArrowsAlt } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { CSSProperties } from "react";
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
}) => {
  const dispatch = useDispatch();
  const redrawPrev = useSelector(getRedrawPreview);

  const normalStyle: CSSProperties = {
    fontSize,
    marginTop: "4px",
    pointerEvents: "auto",
  };

  const smallStyle: CSSProperties = {
    position: "absolute",
    top: "50%",
    left: "50%",
    fontSize: "300%",
    // fontSize: "14px ",
    transform: "translate(-50%, -50%)",
    pointerEvents: "auto",
  };

  const updateScaleHandler = () => {
    dispatch(changeRedrawPreview(!redrawPrev));
  };

  return (
    <>
      {!hide && (
        <FontAwesomeIcon
          icon={faArrowsAlt}
          // style={smallMode ? smallStyle : normalStyle}
          style={{
            transform: "rotate(45deg)",
            fontSize: "26px",
            cursor: "pointer",
            pointerEvents: "auto",
          }}
          onClick={updateScaleHandler}
        />
      )}
    </>
  );
};

export default UpdateScalePrintButton;
