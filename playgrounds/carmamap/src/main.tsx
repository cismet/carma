import { createRoot } from "react-dom/client";
import { RouterProvider, createHashRouter } from "react-router-dom";

import { suppressReactCismapErrors } from "@carma-commons/utils";

import App from "./app/App";
import { CESIUM_CONFIG } from "./app/config/app.config";
import { setupCesiumEnvironment } from "@carma-mapping/engines/cesium";

suppressReactCismapErrors();

setupCesiumEnvironment(CESIUM_CONFIG);

console.debug("RENDER: [CARMAMAP] ROOT");

const root = createRoot(document.getElementById("root") as HTMLElement);

const router = createHashRouter([
  {
    path: "/",
    element: <App />,
  },
]);

root.render(<RouterProvider router={router} />);
