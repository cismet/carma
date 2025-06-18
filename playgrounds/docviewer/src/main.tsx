import { StrictMode, useState, type CSSProperties } from "react";
import * as ReactDOM from "react-dom/client";
import {
  RouterProvider,
  createHashRouter,
  useParams,
  Link,
} from "react-router-dom";
import { DocumentViewer } from "@carma-commons/document-viewer";

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

// Reusable styles
const containerStyle: CSSProperties = {
  minHeight: "100vh",
  background: "linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%)",
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
  padding: "2rem",
};

const cardStyle: CSSProperties = {
  background: "white",
  padding: "2rem",
  borderRadius: "15px",
  boxShadow: "0 10px 20px rgba(0, 0, 0, 0.1)",
  maxWidth: "600px",
  width: "100%",
};

const titleStyle: CSSProperties = {
  color: "#2c3e50",
  marginBottom: "1.5rem",
  textAlign: "center",
};

const introTextStyle: CSSProperties = {
  textAlign: "center",
  color: "#7f8c8d",
  marginBottom: "2rem",
  lineHeight: 1.6,
};

const linksGridStyle: CSSProperties = {
  display: "grid",
  gap: "1rem",
};

const linkStyle: CSSProperties = {
  background: "#3498db",
  color: "white",
  padding: "1rem",
  textDecoration: "none",
  borderRadius: "8px",
  transition: "transform 0.2s, background 0.2s",
  textAlign: "center",
  display: "block",
};

const linkHoverStyle: CSSProperties = {
  transform: "translateY(-2px)",
  background: "#2980b9",
};

function Landing() {
  const [hoveredLink, setHoveredLink] = useState<string | null>(null);

  return (
    <div style={containerStyle}>
      <div style={cardStyle}>
        <h1 style={titleStyle}>DocViewer Demos</h1>
        <p style={introTextStyle}>
          Willkommen bei unserer DocViewer-Demo-Sammlung! Hier finden Sie
          verschiedene Beispieldokumente zum Testen.
        </p>
        <div style={linksGridStyle}>
          <Link
            to="/docs/468/1/1"
            style={{
              ...linkStyle,
              ...(hoveredLink === "468" ? linkHoverStyle : {}),
            }}
            onMouseEnter={() => setHoveredLink("468")}
            onMouseLeave={() => setHoveredLink(null)}
          >
            BPlan 468
          </Link>
          <Link
            to="/docs/827/1/1"
            style={{
              ...linkStyle,
              ...(hoveredLink === "827" ? linkHoverStyle : {}),
            }}
            onMouseEnter={() => setHoveredLink("827")}
            onMouseLeave={() => setHoveredLink(null)}
          >
            BPlan 827
          </Link>
          <Link
            to="/docs/1202/1/1"
            style={{
              ...linkStyle,
              ...(hoveredLink === "1202" ? linkHoverStyle : {}),
            }}
            onMouseEnter={() => setHoveredLink("1202")}
            onMouseLeave={() => setHoveredLink(null)}
          >
            BPlan 1202
          </Link>
          <Link
            to="/docs/1223/1/1"
            style={{
              ...linkStyle,
              ...(hoveredLink === "1223" ? linkHoverStyle : {}),
            }}
            onMouseEnter={() => setHoveredLink("1223")}
            onMouseLeave={() => setHoveredLink(null)}
          >
            BPlan 1223
          </Link>
        </div>
      </div>
    </div>
  );
}

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
      path: "/",
      element: <Landing />,
    },
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
