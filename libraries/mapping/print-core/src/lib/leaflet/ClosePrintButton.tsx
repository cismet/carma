import { faTimes } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

// Redux removed: the close action is supplied by the parent via the
// `closePrintMode` prop (in the app this dispatches setUIMode("default")).
const ClosePrintButton = ({
  closePrintMode,
  fontSize = "28px",
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
            pointerEvents: "auto",
          }}
          onClick={() => closePrintMode()}
        />
      )}
    </>
  );
};

export default ClosePrintButton;
