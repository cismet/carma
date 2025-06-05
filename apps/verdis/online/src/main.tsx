import { StrictMode } from "react";
import * as ReactDOM from "react-dom/client";
import { RouterProvider, createHashRouter } from "react-router-dom";
import { Provider } from "react-redux";

import TopicMapContextProvider from "react-cismap/contexts/TopicMapContextProvider";
import { MappingConstants } from "react-cismap";
import { persistStore } from "redux-persist";
import store from "./store";
import { PersistGate } from "redux-persist/integration/react";
import KassenzeichenViewer from "./app/components/KassenzeichenViewer";
import VerdisOnlineLanding from "./app/components/VerdisOnlineLanding";
import "bootstrap/dist/css/bootstrap.min.css";
import Layout from "./app/components/Layout";
import VerdisOnlineHelp from "./containers/VerdisOnlineHelpFAQs";
import { PLAYGROUND } from "./constants/cids";
import { defaultLayerConf } from "react-cismap/tools/layerFactory";

const baseLayerConf = {
  ...defaultLayerConf,
};
baseLayerConf.namedLayers.trueOrtho2024 = {
  type: "wms",
  url: "https://geo.udsp.wuppertal.de/geoserver-cloud/ows",
  layers: "GIS-102:trueortho2024",
  transparent: true,
};

const root = ReactDOM.createRoot(
  document.getElementById("root") as HTMLElement
);

let appOverlayStyle;

if (PLAYGROUND === true) {
  appOverlayStyle = {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    border: "6px solid #46EE57",
    pointerEvents: "none", // This ensures the overlay doesn't interfere with any interactions
    boxSizing: "border-box",
    zIndex: 999999, // High z-index to ensure it's on top
  };
  // } else if (PLAYGROUND === "unconfigured") {
  //   appOverlayStyle = {
  //     position: "absolute",
  //     top: 0,
  //     right: 0,
  //     bottom: 0,
  //     left: 0,
  //     border: "6px solid #F62143",
  //     pointerEvents: "none", // This ensures the overlay doesn't interfere with any interactions
  //     boxSizing: "border-box",
  //     zIndex: 999999, // High z-index to ensure it's on top
  //   };
} else {
  appOverlayStyle = {};
}

const persistor = persistStore(store);

const router = createHashRouter(
  [
    {
      path: "/",
      element: <VerdisOnlineLanding />,
    },
    {
      path: "/meinkassenzeichen/:layers?",
      element: <KassenzeichenViewer />,
    },
    {
      path: "/verdisOnlineHilfeFAQs",
      element: <VerdisOnlineHelp />,
    },
  ],
  {}
);

root.render(
  <StrictMode>
    <Provider store={store}>
      <TopicMapContextProvider
        referenceSystemDefinition={MappingConstants.proj4crs25832def}
        mapEPSGCode="25832"
        referenceSystem={MappingConstants.crs25832}
        baseLayerConf={baseLayerConf}
      >
        <PersistGate loading={null} persistor={persistor}>
          <Layout>
            <RouterProvider router={router} />
          </Layout>
          <div style={appOverlayStyle} />
        </PersistGate>
      </TopicMapContextProvider>
    </Provider>
  </StrictMode>
);
