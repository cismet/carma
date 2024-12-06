import { faRotateRight, faTimes } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

const UpdateScalePrintButton = ({
  updateScaleHandler,
  fontSize = "24px",
  hide = false,
}) => {
  return (
    <>
      {!hide && (
        <FontAwesomeIcon
          icon={faRotateRight}
          className="text-xl cursor-pointer"
          style={{
            fontSize,
            marginLeft: "auto",
          }}
          onClick={updateScaleHandler}
        />
      )}
    </>
  );
};

export default UpdateScalePrintButton;
