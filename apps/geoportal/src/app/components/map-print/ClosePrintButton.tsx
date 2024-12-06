import { faTimes } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

const ClosePrintButton = ({
  closePrintMode,
  fontSize = "28px",
  hide = false,
}) => {
  return (
    <>
      {!hide && (
        <FontAwesomeIcon
          icon={faTimes}
          className="text-xl cursor-pointer"
          style={{
            fontSize,
            marginLeft: "auto",
          }}
          onClick={closePrintMode}
        />
      )}
    </>
  );
};

export default ClosePrintButton;
