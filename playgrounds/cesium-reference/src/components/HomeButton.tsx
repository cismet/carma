import { Button, ConfigProvider, theme } from "antd";
import { HomeOutlined } from "@ant-design/icons";

import "../styles/cesium-ref-styles.css";

interface HomeButtonProps {
  onHomeClick: () => void;
}

const HomeButton: React.FC<HomeButtonProps> = ({ onHomeClick }) => {
  return (
    <div className="home-button-container">
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
