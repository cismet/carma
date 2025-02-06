import { StrictMode } from "react";
import * as ReactDOM from "react-dom/client";
import { RouterProvider, createHashRouter, useParams } from "react-router-dom";
import { Doc, DocumentViewer } from "@carma-commons/document-viewer";

import docs468 from "./assets/468.json";
import docs827 from "./assets/827.json";
import docs1202 from "./assets/1202.json";
import docs1223 from "./assets/1223.json";
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

function DocumentViewerWrapper() {
  const { docPackageId, file, page } = useParams();

  if (docPackageId === "468") {
    return <DocumentViewer docs={docs468} mode="bplaene" />;
  } else if (docPackageId === "827") {
    return <DocumentViewer docs={docs827} mode="bplaene" />;
  } else if (docPackageId === "1202") {
    return <DocumentViewer docs={docs1202} mode="bplaene" />;
  } else if (docPackageId === "1223") {
    return <DocumentViewer docs={docs1223} mode="bplaene" />;
  } else {
    return <DocumentViewer docs={docs827} mode="bplaene" />;
  }
}

const router = createHashRouter(
  [
    {
      path: "/docs/:docPackageId?/:file?/:page?",
      element: <DocumentViewerWrapper />,
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
