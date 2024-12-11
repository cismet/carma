import { faTimes } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { setUIMode } from "../../store/slices/ui";
import { useDispatch } from "react-redux";

const ClosePrintButton = ({
  closePrintMode,
  fontSize = "28px",
  hide = false,
  smallMode = false,
}) => {
  const dispatch = useDispatch();
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
          onClick={() => dispatch(setUIMode("default"))}
        />
      )}
    </>
  );
};

export default ClosePrintButton;
