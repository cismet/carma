import { StrictMode } from "react";
import * as ReactDOM from "react-dom/client";
import {
  HashRouter as Router,
  Routes,
  Route,
  useSearchParams,
  useNavigate,
  useParams,
} from "react-router-dom";
import App from "./app/App";

const originalWarn = console.warn.bind(console);
const originalError = console.error.bind(console);
console.warn = (message, ...args) => {
  if (
    message?.includes &&
    !message.includes("ReactDOM.render is no longer supported in React 18")
  ) {
    originalWarn(message, ...args);
  }
};
console.error = (message, ...args) => {
  if (
    message?.includes &&
    !message.includes("ReactDOM.render is no longer supported in React 18")
  ) {
    originalError(message, ...args);
  }
};
const root = ReactDOM.createRoot(
  document.getElementById("root") as HTMLElement
);
if (typeof global === "undefined") {
  window.global = window;
}

function AppWrapper() {
  // The splat captures nested config paths like "servicenow/schulen"
  const { "*": splat } = useParams();
  let name = (splat ?? "").replace(/^\/+|\/+$/g, "");
  if (name === "") {
    name = "GTM_ohne_Konfiguration";
  }
  //set the window title to the last path segment but replace the underscores with spaces
  const lastSegment = name.split("/").pop() ?? name;
  document.title = lastSegment.split("_").join(" ");

  return <App name={name} />;
}

root.render(
  // <StrictMode>
  <Router>
    <Routes>
      <Route path="/*" element={<AppWrapper />}></Route>
    </Routes>
  </Router>
  // </StrictMode>
);
