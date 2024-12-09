import { useSelector } from "react-redux";
import { getUIMode } from "../../store/slices/ui";

const PrintPreview = () => {
  const mode = useSelector(getUIMode);

  return (
    <>
      {mode === "print" && (
        <div
          id="preview"
          style={{ width: "200px", height: "20px", background: "black" }}
        ></div>
      )}
    </>
  );
};

export default PrintPreview;
