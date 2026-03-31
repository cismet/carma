import { ConfigProvider, theme } from "antd";
import * as ReactDOM from "react-dom/client";

import { setupCesiumEnvironment } from "@carma-mapping/engines/cesium";

import { App } from "./App";
import { APP_BASE_PATH, CESIUM_PATHNAME } from "./config";

import "./styles.css";
import "antd/dist/reset.css";
import "cesium/Build/Cesium/Widgets/widgets.css";
const CESIUM_BASE_URL = `${APP_BASE_PATH}${CESIUM_PATHNAME}`;
setupCesiumEnvironment({ baseUrl: CESIUM_BASE_URL });

const root = ReactDOM.createRoot(
  document.getElementById("root") as HTMLElement
);

root.render(
  <ConfigProvider
    theme={{
      algorithm: theme.compactAlgorithm,
      components: { Collapse: { contentPadding: 0 } },
    }}
  >
    <App />
  </ConfigProvider>
);
