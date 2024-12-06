import { LoadingOutlined } from "@ant-design/icons";
import { Spin } from "antd";

const PrintButton = ({
  hadlerStartPrint,
  loading,
  width = "72px",
  height = "34px",
  fontSize = "14px",
  hide = false,
}) => {
  // useEffect(() => {
  // }, [width, height]);
  return (
    <>
      {!hide && (
        <button
          className="rectangle-button"
          onClick={hadlerStartPrint}
          disabled={loading}
          style={{
            fontSize,
            width,
            height,
            opacity: width !== "0px" ? "1" : "0",
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
