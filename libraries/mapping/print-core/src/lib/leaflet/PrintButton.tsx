import { LoadingOutlined } from "@ant-design/icons";
import { Button, Spin } from "antd";
import {
  getCenterPrintPreview,
  getPrintLayers,
  printMap,
} from "./print.helper";

// Redux removed: orientation / dpi / printName / bgLayer / layers / loading /
// scale arrive as props, and the writes (changeIfMapPrinted, changeIsLoading,
// changePrintError) are supplied as the setIfMapPrinted / handleIsLoading /
// handleIsError callbacks.
const PrintButton = ({
  hide = false,
  smallMode = false,
  map,
  orientation,
  dpi,
  printName,
  bgLayer,
  layers,
  loading,
  scale,
  setIfMapPrinted,
  handleIsLoading,
  handleIsError,
}: any) => {
  const startPint = () => {
    if (map) {
      setIfMapPrinted(true);
      const polygonCenter = getCenterPrintPreview(map);
      const layesPrint = getPrintLayers(bgLayer, layers);
      printMap(
        polygonCenter,
        scale,
        layesPrint,
        orientation,
        Number(dpi),
        printName,
        handleIsLoading,
        handleIsError
      );
    }
  };
  return (
    <>
      {!hide && !smallMode && (
        // <button
        //   className="rectangle-button"
        //   onClick={startPint}
        //   disabled={loading}
        //   style={{
        //     fontSize,
        //     width,
        //     height,
        //     pointerEvents: "auto",
        //     // opacity: width !== "0px" ? "1" : "0",
        //   }}
        // >
        //   {/* <FontAwesomeIcon icon={faPrint} className="text-xl cursor-pointer" /> */}

        <Button
          type="primary"
          // className="rectangle-button"
          loading={loading}
          onClick={startPint}
          style={{ pointerEvents: "auto" }}
        >
          Drucken
        </Button>
      )}
    </>
  );
};

export default PrintButton;
