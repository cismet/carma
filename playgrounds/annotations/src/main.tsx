import * as ReactDOM from "react-dom/client";

import { ConfigProvider, theme } from "antd";

import { setupCesiumEnvironment } from "@carma-mapping/engines/cesium";
import { HashStateProvider } from "@carma-providers/hash-state";

import { App } from "./App";
import { APP_BASE_PATH, CESIUM_PATHNAME } from "./config";

import "cesium/Build/Cesium/Widgets/widgets.css";
import "antd/dist/reset.css";
import "./styles.css";

const CESIUM_BASE_URL = `${APP_BASE_PATH}${CESIUM_PATHNAME}`;
setupCesiumEnvironment({ baseUrl: CESIUM_BASE_URL });

const normalizeLegacyAnnotationsPlaygroundHash = () => {
  const hash = window.location.hash;
  if (hash === "#/" || hash === "#%2F") {
    const nextUrl = `${window.location.pathname}${window.location.search}`;
    window.history.replaceState({}, "", nextUrl);
    return;
  }

  const rawHash = hash.startsWith("#?") ? hash.slice(2) : "";
  if (!rawHash) {
    return;
  }

  const params = new URLSearchParams(rawHash);
  let changed = false;

  const renameKey = (from: string, to: string) => {
    const value = params.get(from);
    if (value === null || params.has(to)) {
      return;
    }
    params.set(to, value);
    params.delete(from);
    changed = true;
  };

  renameKey("z", "zoom");
  renameKey("bearing", "b");
  renameKey("pitch", "p");
  renameKey("altitude", "h");

  if (changed) {
    const nextHash = params.toString();
    const nextUrl = `${window.location.pathname}${window.location.search}${
      nextHash ? `#?${nextHash}` : ""
    }`;
    window.history.replaceState({}, "", nextUrl);
  }
};

normalizeLegacyAnnotationsPlaygroundHash();

const root = ReactDOM.createRoot(
  document.getElementById("root") as HTMLElement
);

root.render(
  <HashStateProvider routingMode="neutral">
    <ConfigProvider
      theme={{
        algorithm: theme.compactAlgorithm,
        components: { Collapse: { contentPadding: 0 } },
      }}
    >
      <App />
    </ConfigProvider>
  </HashStateProvider>
);
