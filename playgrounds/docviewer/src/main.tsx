import { StrictMode } from "react";
import * as ReactDOM from "react-dom/client";
import { RouterProvider, createHashRouter } from "react-router-dom";
import { Doc, DocumentViewer } from "@carma-commons/document-viewer";

import docs from "./assets/docs.json";
import TopicMapContextProvider from "react-cismap/contexts/TopicMapContextProvider";

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

const router = createHashRouter(
  [
    {
      path: "/docs/:docPackageId?/:file?/:page?",
      element: <DocumentViewer docs={docs} mode="bplaene" />,
    },
  ],
  {}
);
const root = ReactDOM.createRoot(
  document.getElementById("root") as HTMLElement
);

const RootComponent = () => {
  return <div className="App"></div>;
};

root.render(
  <StrictMode>
    <TopicMapContextProvider>
      <RouterProvider router={router} />
    </TopicMapContextProvider>
  </StrictMode>
);
