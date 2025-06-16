import { Button } from "antd";
import { HomeOutlined } from "@ant-design/icons";
import { useCesiumViewer } from "../contexts/CesiumViewerContext";

import "../styles/cesium-ref-styles.css";

const HomeButton: React.FC = () => {
  const { zoomToTileset } = useCesiumViewer();
  return (
    <div className="panel-base">
      <Button
        type="default"
        shape="circle"
        icon={<HomeOutlined />}
        onClick={zoomToTileset}
        size="large"
      />
    </div>
  );
};

export default HomeButton;
