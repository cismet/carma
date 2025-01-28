import * as ReactDOM from "react-dom/client";
import { HashRouter as Router, Routes, Route } from "react-router-dom";
import { views } from "./config";
import "cesium/Build/Cesium/Widgets/widgets.css";
import "antd/dist/reset.css";
import Home from "./Home";

declare global {
  interface Window {
    CESIUM_BASE_URL: string;
  }
}

const APP_BASE_PATH = import.meta.env.BASE_URL;
const CESIUM_PATHNAME = "__cesium__";
const CESIUM_BASE_URL = `${APP_BASE_PATH}${CESIUM_PATHNAME}`;
window.CESIUM_BASE_URL = CESIUM_BASE_URL;

const root = ReactDOM.createRoot(
  document.getElementById("root") as HTMLElement
);
root.render(
  <Router>
    <Routes>
      <Route path="/" element={<Home />} />
      {views.map((view) => (
        <Route key={view.path} path={view.path} element={<view.component />} />
      ))}
    </Routes>
  </Router>
);
