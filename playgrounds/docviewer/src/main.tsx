import { StrictMode } from "react";
import * as ReactDOM from "react-dom/client";
import {
  RouterProvider,
  createHashRouter,
  useParams,
  Link,
} from "react-router-dom";
import { DocumentViewer } from "@carma-commons/document-viewerX";
import styled from "@emotion/styled";

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

const Container = styled.div`
  min-height: 100vh;
  background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%);
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 2rem;
`;

const Card = styled.div`
  background: white;
  padding: 2rem;
  border-radius: 15px;
  box-shadow: 0 10px 20px rgba(0, 0, 0, 0.1);
  max-width: 600px;
  width: 100%;
`;

const Title = styled.h1`
  color: #2c3e50;
  margin-bottom: 1.5rem;
  text-align: center;
`;

const IntroText = styled.p`
  text-align: center;
  color: #7f8c8d;
  margin-bottom: 2rem;
  line-height: 1.6;
`;

const LinksGrid = styled.div`
  display: grid;
  gap: 1rem;
`;

const StyledLink = styled(Link)`
  background: #3498db;
  color: white;
  padding: 1rem;
  text-decoration: none;
  border-radius: 8px;
  transition: transform 0.2s, background 0.2s;
  text-align: center;

  &:hover {
    transform: translateY(-2px);
    background: #2980b9;
  }
`;

function Landing() {
  return (
    <Container>
      <Card>
        <Title>DocViewer Demos</Title>
        <IntroText>
          Willkommen bei unserer DocViewer-Demo-Sammlung! Hier finden Sie
          verschiedene Beispieldokumente zum Testen.
        </IntroText>
        <LinksGrid>
          <StyledLink to="/docs/468">BPlan 468</StyledLink>
          <StyledLink to="/docs/827">BPlan 827</StyledLink>
          <StyledLink to="/docs/1202">BPlan 1202</StyledLink>
          <StyledLink to="/docs/1223">BPlan 1223</StyledLink>
        </LinksGrid>
      </Card>
    </Container>
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
