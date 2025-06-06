import { Button, ConfigProvider, theme } from "antd";
import { HomeOutlined } from "@ant-design/icons";

import "../styles/cesium-ref-styles.css";

interface HomeButtonProps {
  onHomeClick: () => void;
}

const HomeButton: React.FC<HomeButtonProps> = ({ onHomeClick }) => {
  return (
    <div
      className="panel-base panel-bottom-right"
      style={{ padding: "0.5rem" }}
    >
      <ConfigProvider theme={{ algorithm: theme.darkAlgorithm }}>
        <Button
          type="default"
          shape="circle"
          icon={<HomeOutlined />}
          onClick={onHomeClick}
          size="large"
        />
      </ConfigProvider>
    </div>
  );
};

export default HomeButton;
