// this will be needed if we need modals
// import "bootstrap/dist/css/bootstrap.min.css";
// import "react-cismap/topicMaps.css";
// Fix for react-image-lightbox in Vite (needs global to be defined)
// @ts-ignore
window.global = window;
import "./index.css";
import { StrictMode, useEffect, useState } from "react";
import * as ReactDOM from "react-dom/client";
import {
  GazDataProvider,
  SelectionProvider,
} from "@carma-appframeworks/portals";
import { SandboxedEvalProvider } from "@carma-commons/sandbox-eval";
import { Navigate, RouterProvider, createHashRouter } from "react-router-dom";
import { Provider, useDispatch, useSelector } from "react-redux";
import Layout from "./components/commons/Layout";
import BelisDataProvider from "./components/commons/BelisDataProvider";
import Login from "./components/pages/Login";
import store from "./store";
import persistStore from "redux-persist/es/persistStore";
import { PersistGate } from "redux-persist/integration/react";
import TopicMapContextProvider from "react-cismap/contexts/TopicMapContextProvider";
import { CarmaLightBox } from "@carma-mapping/lightbox";
import MainPage from "./components/pages/MainPage";
import KeyTablesPage from "./components/pages/KeyTablesPage";
import ArbeitsauftraegeePage from "./components/pages/ArbeitsauftraegeePage";
import {
  checkJWTValidation,
  getJWT,
  getLogin,
  getLoginFromJWT,
} from "./store/slices/auth";
import type { UnknownAction } from "redux";
import { gazDataConfig } from "./config/gazData";
import { SyncProvider } from "@carma-providers/syncing";
import { useDeployment, Deployment } from "@carma-commons/utils";
import { APP_CONFIG } from "./config/appConfig";
import { belisTaskFormatter } from "./config/taskFormatter";
import {
  LibreContextProvider,
  MapSelectionProvider,
  MapHighlightProvider,
  DatasheetProvider,
} from "@carma-mapping/engines/maplibre";

const persistor = persistStore(store);

// Non-live deployment border: shown on localDev, dev and PR deployments, hidden
// on live. Amber color matches the regular/brandnew toggle buttons.
const DevDeploymentBorder = () => {
  const deployment = useDeployment();
  if (deployment === Deployment.LIVE || deployment === null) {
    return null;
  }
  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        right: 0,
        bottom: 0,
        left: 0,
        border: "3px solid #eab308",
        pointerEvents: "none", // don't intercept clicks/interactions
        boxSizing: "border-box",
        zIndex: 999999,
      }}
    />
  );
};

const NavBarWrapper = () => {
  const dispatch = useDispatch();
  const jwt = useSelector(getJWT);
  const login = useSelector(getLogin) || (jwt ? getLoginFromJWT(jwt) : null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    setIsLoading(true);
    dispatch(checkJWTValidation() as unknown as UnknownAction);
    setIsLoading(false);
  }, []);

  if (isLoading) {
    return <></>;
  }

  if (jwt === undefined) {
    return <Navigate to="/login" />;
  }

  return (
    <SyncProvider
      jwt={jwt}
      login={login}
      config={APP_CONFIG.sync}
      taskFormatter={belisTaskFormatter}
    >
      <BelisDataProvider jwt={jwt}>
        <Layout />
      </BelisDataProvider>
    </SyncProvider>
  );
};

const router = createHashRouter(
  [
    {
      path: "/",
      element: <NavBarWrapper />,
      // errorElement: productionMode && (
      //   <Result
      //     status="404"
      //     title="404"
      //     subTitle="Die Seite wurde nicht gefunden"
      //     extra={
      //       <Button type="primary" href="/">
      //         Zurück
      //       </Button>
      //     }
      //   />
      // ),
      children: [
        {
          path: "/",
          element: <MainPage />,
        },
        {
          path: "/arbeitsauftraege",
          element: <ArbeitsauftraegeePage />,
        },
        {
          path: "/key-tables",
          element: <KeyTablesPage />,
        },
      ],
    },
    {
      path: "/login",
      element: <Login />,
    },
  ],
  {}
);

const root = ReactDOM.createRoot(
  document.getElementById("root") as HTMLElement
);

root.render(
  <StrictMode>
    <DevDeploymentBorder />
    <Provider store={store}>
      <SandboxedEvalProvider>
        <GazDataProvider config={gazDataConfig}>
          <SelectionProvider>
            <PersistGate loading={null} persistor={persistor}>
              <TopicMapContextProvider appKey="belis-desktop.map">
                <LibreContextProvider>
                  <MapSelectionProvider>
                    <MapHighlightProvider>
                      <DatasheetProvider>
                        <CarmaLightBox>
                          <RouterProvider router={router} />
                        </CarmaLightBox>
                      </DatasheetProvider>
                    </MapHighlightProvider>
                  </MapSelectionProvider>
                </LibreContextProvider>
              </TopicMapContextProvider>
            </PersistGate>
          </SelectionProvider>
        </GazDataProvider>
      </SandboxedEvalProvider>
    </Provider>
  </StrictMode>
);
