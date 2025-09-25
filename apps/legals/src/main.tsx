import { StrictMode } from "react";
import * as ReactDOM from "react-dom/client";
import App from "./app/App";
import { RouterProvider, createHashRouter } from "react-router-dom";
import {
  Datenschutzerklärung,
  Impressum,
} from "@carma-collab/wuppertal/legals";

const root = ReactDOM.createRoot(
  document.getElementById("root") as HTMLElement
);

root.render(
  <StrictMode>
    <RouterProvider
      router={createHashRouter([
        {
          path: "/",
          element: <App />,
        },
        {
          path: "/Datenschutzerklaerung_DigiTal-Zwilling_Geoportal",
          element: <Datenschutzerklärung />,
        },
        {
          path: "/Impressum_DigiTal-Zwilling_Geoportal",
          element: <Impressum />,
        },
      ])}
    />
  </StrictMode>
);
