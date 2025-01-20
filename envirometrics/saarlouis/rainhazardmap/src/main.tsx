import { createRoot } from "react-dom/client";
import { RouterProvider, createHashRouter } from "react-router-dom";
import React from "react";
import ReactDOM from "react-dom";
import "./index.css";
import "react-bootstrap-typeahead/css/Typeahead.css";
import "bootstrap/dist/css/bootstrap.min.css";
import "leaflet/dist/leaflet.css";
import "react-cismap/topicMaps.css";
import App from "./App";

const root = createRoot(document.getElementById("root") as HTMLElement);

root.render(
  <React.StrictMode>
    {/* <RouterProvider
      router={createHashRouter([
        {
          path: "/",
          element: <App />,
        },
        {
          path: "/publish",
          element: <App published={true} />,
        },
      ])}
    /> */}
    <App />
  </React.StrictMode>
);
