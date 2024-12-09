import { faRotateRight, faTimes } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { CSSProperties } from "react";

const UpdateScalePrintButton = ({
  updateScaleHandler,
  fontSize = "24px",
  hide = false,
  smallMode = false,
}) => {
  const normalStyle: CSSProperties = {
    fontSize,
    marginTop: "4px",
  };

  const smallStyle: CSSProperties = {
    position: "absolute",
    top: "50%",
    left: "50%",
    fontSize: "300%",
    // fontSize: "14px ",
    transform: "translate(-50%, -50%)",
  };

  return (
    <>
      {!hide && (
        <FontAwesomeIcon
          icon={faRotateRight}
          className="cursor-pointer"
          style={smallMode ? smallStyle : normalStyle}
          onClick={updateScaleHandler}
        />
      )}
    </>
  );
};

export default UpdateScalePrintButton;
