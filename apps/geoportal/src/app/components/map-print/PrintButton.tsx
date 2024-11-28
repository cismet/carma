import { LoadingOutlined } from "@ant-design/icons";
import { Spin } from "antd";
const PrintButton = ({ hadlerStartPrint, loading }) => {
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
