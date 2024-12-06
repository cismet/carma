import { faTimes } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

const ClosePrintButton = ({
  closePrintMode,
  fontSize = "24px",
  hide = false,
  smallMode = false,
}) => {
  return (
    <>
      {!hide && !smallMode && (
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
