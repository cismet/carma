import { useEffect } from "react";
import { LoadingOutlined } from "@ant-design/icons";
import { Spin } from "antd";
const PrintButton = ({ hadlerStartPrint, loading }) => {
  useEffect(() => {
    console.log("xxx isloading comp", loading);
  }, [loading]);
  return (
    <div>
      {loading && (
        <Spin indicator={<LoadingOutlined spin />} className="mr-2" />
      )}
      <button className="rectangle-button ml-auto" onClick={hadlerStartPrint}>
        Print
      </button>
    </div>
  );
};

export default PrintButton;
