import * as ReactDOM from "react-dom/client";

import { ConfigProvider, theme } from "antd";
import { Leva } from "leva";
import { MemoryRouter } from "react-router-dom";

import { setupCesiumEnvironment } from "@carma-mapping/engines/cesium";
import { HashStateProvider } from "@carma-providers/hash-state";

import { App } from "./App";
import { APP_BASE_PATH, CESIUM_PATHNAME } from "./config";

import "cesium/Build/Cesium/Widgets/widgets.css";
import "antd/dist/reset.css";
import "./styles.css";

const CESIUM_BASE_URL = `${APP_BASE_PATH}${CESIUM_PATHNAME}`;
setupCesiumEnvironment({ baseUrl: CESIUM_BASE_URL });

const root = ReactDOM.createRoot(
  document.getElementById("root") as HTMLElement
);

root.render(
  <MemoryRouter>
    <HashStateProvider>
      <ConfigProvider
        theme={{
          algorithm: theme.compactAlgorithm,
          components: { Collapse: { contentPadding: 0 } },
        }}
      >
        <>
          <div className="annotations-playground-leva">
            <Leva
              fill
              neverHide
              oneLineLabels={false}
              collapsed={false}
              titleBar={{ drag: true, filter: true }}
            />
          </div>
          <App />
        </>
      </ConfigProvider>
    </HashStateProvider>
  </MemoryRouter>
);
