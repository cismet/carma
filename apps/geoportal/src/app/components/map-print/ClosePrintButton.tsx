import { faTimes } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

const ClosePrintButton = ({
  closePrintMode,
  fontSize = "28px",
  hide = false,
  smallMode = false,
}) => {
  console.log("xxx print close", closePrintMode);
  return (
    <>
      {!hide && !smallMode && (
        <FontAwesomeIcon
          icon={faTimes}
          className="text-xl cursor-pointer"
          style={{
            fontSize,
            marginLeft: "auto",
            pointerEvents: "auto",
          }}
          onClick={closePrintMode}
        />
      )}
    </>
  );
};

export default ClosePrintButton;
