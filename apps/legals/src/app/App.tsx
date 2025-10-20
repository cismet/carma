import { Button, Space, Typography, Layout } from "antd";
import { FileTextOutlined, InfoCircleOutlined } from "@ant-design/icons";

const { Title } = Typography;
const { Content } = Layout;

export function App() {
  const baseUrl = window.location.origin + window.location.pathname;

  return (
    <Layout style={{ minHeight: "100vh", background: "transparent" }}>
      <Content
        style={{
          padding: "50px 20px",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          backgroundImage: `url('${baseUrl}base_blurred.jpg.png')`,
          backgroundSize: "cover",
          backgroundPosition: "center",
          backgroundRepeat: "no-repeat",
        }}
      >
        <div
          style={{
            background: "rgba(255, 255, 255, 0.95)",
            padding: "40px",
            borderRadius: "12px",
            boxShadow: "0 8px 24px rgba(0,0,0,0.2)",
            textAlign: "center",
            maxWidth: "600px",
            width: "100%",
            backdropFilter: "blur(5px)",
          }}
        >
          <Title level={2} style={{ marginBottom: "30px" }}>
            DigiTal-Zwilling Geoportal Dokumente
          </Title>
          <Space direction="vertical" size="large" style={{ width: "100%" }}>
            <Button
              size="large"
              icon={<FileTextOutlined />}
              href={`${baseUrl}#/Datenschutzerklaerung_DigiTal-Zwilling_Geoportal`}
              style={{ width: "100%", height: "50px" }}
            >
              Datenschutzerklärung
            </Button>
            <Button
              size="large"
              icon={<InfoCircleOutlined />}
              href={`${baseUrl}#/Impressum_DigiTal-Zwilling_Geoportal`}
              style={{ width: "100%", height: "50px" }}
            >
              Impressum
            </Button>
          </Space>
          <Title level={2} style={{ marginBottom: "30px" }}>
            DigiTal-Zwilling TopicMaps Dokumente
          </Title>
          <Space direction="vertical" size="large" style={{ width: "100%" }}>
            <Button
              size="large"
              icon={<FileTextOutlined />}
              href={`${baseUrl}#/Datenschutzerklaerung_DigiTal-Zwilling_TopicMaps`}
              style={{ width: "100%", height: "50px" }}
            >
              Datenschutzerklärung
            </Button>
            <Button
              size="large"
              icon={<InfoCircleOutlined />}
              href={`${baseUrl}#/Impressum_DigiTal-Zwilling_TopicMaps`}
              style={{ width: "100%", height: "50px" }}
            >
              Impressum
            </Button>
          </Space>
        </div>
      </Content>
    </Layout>
  );
}

export default App;
