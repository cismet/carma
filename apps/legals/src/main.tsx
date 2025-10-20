import { StrictMode, useEffect } from "react";
import * as ReactDOM from "react-dom/client";
import App from "./app/App";
import { RouterProvider, createHashRouter } from "react-router-dom";
import {
  DatenschutzerklärungGeoportal,
  ImpressumGeoportal,
  DatenschutzerklärungTopicMaps,
  ImpressumTopicMaps,
} from "@carma-collab/wuppertal/legals";

// Title wrapper components
const DatenschutzWrapper = () => {
  useEffect(() => {
    document.title = "Datenschutzerklärung";
  }, []);
  return <DatenschutzerklärungGeoportal />;
};

const ImpressumWrapper = () => {
  useEffect(() => {
    document.title = "Impressum";
  }, []);
  return <ImpressumGeoportal />;
};

const DatenschutzTopicMapsWrapper = () => {
  useEffect(() => {
    document.title = "Datenschutzerklärung";
  }, []);
  return <DatenschutzerklärungTopicMaps />;
};

const ImpressumTopicMapsWrapper = () => {
  useEffect(() => {
    document.title = "Impressum";
  }, []);
  return <ImpressumTopicMaps />;
};

const HomeWrapper = () => {
  useEffect(() => {
    document.title = "DigiTal-Zwilling Dokumente";
  }, []);
  return <App />;
};

const root = ReactDOM.createRoot(
  document.getElementById("root") as HTMLElement
);

root.render(
  <StrictMode>
    <RouterProvider
      router={createHashRouter([
        {
          path: "/",
          element: <HomeWrapper />,
        },
        {
          path: "/Datenschutzerklaerung_DigiTal-Zwilling_Geoportal",
          element: <DatenschutzWrapper />,
        },
        {
          path: "/Impressum_DigiTal-Zwilling_Geoportal",
          element: <ImpressumWrapper />,
        },
        {
          path: "/Datenschutzerklaerung_DigiTal-Zwilling_TopicMaps",
          element: <DatenschutzTopicMapsWrapper />,
        },
        {
          path: "/Impressum_DigiTal-Zwilling_TopicMaps",
          element: <ImpressumTopicMapsWrapper />,
        },
      ])}
    />
  </StrictMode>
);
