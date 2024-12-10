import { LoadingOutlined } from "@ant-design/icons";
import { Spin } from "antd";
import { useDispatch, useSelector } from "react-redux";
import {
  changeIsLoading,
  changePrintError,
  getDPI,
  changeIfMapPrinted,
  getIsLoading,
  getOrientation,
  getPrintName,
  getScale,
} from "../../store/slices/print";
import { getBackgroundLayer, getLayers } from "../../store/slices/mapping";
import {
  getCenterPrintPreview,
  getPolygonByLeafletId,
  getPrintLayers,
  printMap,
} from "../../helper/print";
import proj4 from "proj4";

const PrintButton = ({
  handlerStartPrint,
  // loading,
  width = "72px",
  height = "34px",
  fontSize = "14px",
  hide = false,
  smallMode = false,
  map,
}) => {
  const dispatch = useDispatch();
  const orientation = useSelector(getOrientation);
  const dpi = useSelector(getDPI);
  const printName = useSelector(getPrintName);
  const bgLayer = useSelector(getBackgroundLayer);
  const layers = useSelector(getLayers);
  const loading = useSelector(getIsLoading);
  const scale = useSelector(getScale);

  const handleIsLoading = (status) => {
    dispatch(changeIsLoading(status));
  };

  const handleIsError = (status) => {
    dispatch(changePrintError(status));
  };

  const startPint = () => {
    if (map) {
      dispatch(changeIfMapPrinted(true));
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
        <button
          className="rectangle-button"
          onClick={startPint}
          disabled={loading}
          style={{
            fontSize,
            width,
            height,
            pointerEvents: "auto",
            // opacity: width !== "0px" ? "1" : "0",
          }}
        >
          {/* <FontAwesomeIcon icon={faPrint} className="text-xl cursor-pointer" /> */}

          {loading ? (
            <Spin
              indicator={<LoadingOutlined spin />}
              className="text-white"
              size="small"
            />
          ) : (
            "Drucken"
          )}
        </button>
      )}
    </>
  );
};

export default PrintButton;
