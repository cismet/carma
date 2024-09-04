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
  document.getElementById("root") as HTMLElement,
);
if (typeof global === "undefined") {
  window.global = window;
}

function AppWrapper() {
  let { name } = useParams();
  // Now you can use 'name' inside your App component or pass it as a prop
  if (name === undefined) {
    name = "wasserstoff-tankstellenkarte_wuppertal";
  }
  return <App name={name} />;
}

root.render(
  <StrictMode>
    <Router>
      <Routes>
        <Route path="/:name?" element={<AppWrapper />}></Route>
      </Routes>
    </Router>
  </StrictMode>,
);
