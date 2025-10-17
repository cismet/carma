import { createRoot } from "react-dom/client";
import { App } from "./app/App";
import { CESIUM_BASE_URL } from "./app/config/app.config";
import { suppressReactCismapErrors } from "@carma-commons/utils";
import defaultViewerState from "./app/config";
import { setupCesiumEnvironment } from "@carma-mapping/engines/cesium/core";

suppressReactCismapErrors();

setupCesiumEnvironment({ baseUrl: CESIUM_BASE_URL });
const root = createRoot(document.getElementById("root") as HTMLElement);

root.render(<App />);
