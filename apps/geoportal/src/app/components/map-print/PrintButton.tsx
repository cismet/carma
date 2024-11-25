import { useEffect } from "react";
import { LoadingOutlined } from "@ant-design/icons";
import { Spin } from "antd";
const PrintButton = ({ hadlerStartPrint, loading }) => {
  useEffect(() => {
    console.log("xxx isloading comp", loading);
  }, [loading]);
  return (
    <div>
      <button
        className="rectangle-button ml-auto"
        onClick={hadlerStartPrint}
        disabled={loading}
      >
        {loading ? (
          <Spin
            indicator={<LoadingOutlined spin />}
            className="mr-2 "
            size="small"
          />
        ) : (
          "Print"
        )}
      </button>
    </div>
  );
};

export default PrintButton;
