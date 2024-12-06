import { faRotateRight, faTimes } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

const UpdateScalePrintButton = ({
  updateScaleHandler,
  fontSize = "24px",
  hide = false,
  smallMode = false,
}) => {
  return (
    <>
      {!hide && (
        <FontAwesomeIcon
          icon={faRotateRight}
          className="cursor-pointer"
          style={{
            fontSize,
            marginTop: "4px",
          }}
          onClick={updateScaleHandler}
        />
      )}
    </>
  );
};

export default UpdateScalePrintButton;
