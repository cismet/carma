import { Button, ConfigProvider, Result } from "antd";
import "antd/dist/reset.css";
import "bootstrap/dist/css/bootstrap.min.css";
import "react-bootstrap-typeahead/css/Typeahead.css";
import locale from "antd/locale/de_DE";
import React, { useEffect, useState } from "react";
import ReactDOM from "react-dom/client";
import { Provider, useDispatch, useSelector } from "react-redux";
import {
  Navigate,
  Outlet,
  RouterProvider,
  createHashRouter,
  useLocation,
} from "react-router-dom";
import { PersistGate } from "redux-persist/integration/react";
import NavBar from "./components/commons/NavBar";
import "./index.css";
import InfoPage from "./pages/Info";
import LoginPage from "./pages/Login";
import OverviewPage from "./pages/Overview";
import SealedSurfaceOverviewPage from "./pages/SealedSurfaces";
import SealedSurfaceDetailsPage from "./pages/SealedSurfacesDetails";
import SeepagePermitsPage from "./pages/SeepagePermits";
import SeepagePermitsDetailsPage from "./pages/SeepagePermitsDetails";
import StreetCleaningPage from "./pages/StreetCleaning";
import StreetCleaningDetailsPage from "./pages/StreetCleaningDetails";
import store from "./store";
import { checkJWTValidation, getJWT } from "./store/slices/auth";
import TopicMapContextProvider from "react-cismap/contexts/TopicMapContextProvider";
import { GazDataProvider, SelectionProvider } from "@carma-apps/portals";
import {
  additionalLayerConfiguration,
  backgroundConfigurations,
  backgroundModes,
  extendBaseLayerConf,
  offlineConfig,
} from "./constants/backgrounds";
import { defaultLayerConf } from "react-cismap/tools/layerFactory";
import { getReadOnly, getShowChat } from "./store/slices/settings";
import Chat from "./components/commons/Chat";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { persistStore } from "redux-persist";
import { loadGazeteerEntries } from "./store/slices/gazData";
import { getVirtualCityPassword } from "./store/slices/search";
import { MapContainer } from "react-leaflet";
import { suppressReactCismapErrors } from "@carma-commons/utils";
import AlkisLandparcelPage from "./pages/AlkisLandparcelPage";
import AlkisBookingSheetPage from "./pages/AlkisBookingSheetPage";
import { AlkisNav } from "@carma-apps/alkis-renderer";
import { gazDataConfig } from "./config/gazData";
import { mobileInfo } from "@carma-collab/wuppertal/verdis-desktop";
import { MobileWarningMessage } from "@carma-mapping/components";

const logoSrc = "/logo.svg";
const urlPrefix = window.location.origin + window.location.pathname;

const baseLayerConf = extendBaseLayerConf({ ...defaultLayerConf });

const persistor = persistStore(store);

const NavBarWrapper = () => {
  const jwt = useSelector(getJWT);
  const readOnly = useSelector(getReadOnly);
  const location = useLocation();
  const showChat = useSelector(getShowChat);
  const [isLoading, setIsLoading] = useState(false);
  const dispatch = useDispatch();

  useEffect(() => {
    setIsLoading(true);
    dispatch(checkJWTValidation());
    setIsLoading(false);
    // dispatch(loadGazeteerEntries());
    dispatch(getVirtualCityPassword());
  }, []);

  if (isLoading) {
    return <></>;
  }

  if (!jwt) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return (
    <div className="h-screen w-full">
      <NavBar />
      <ConfigProvider componentDisabled={readOnly}>
        <Outlet />
        {showChat ? <Chat /> : <></>}
        <MobileWarningMessage
          headerText={mobileInfo.headerText}
          bodyText={mobileInfo.bodyText}
          confirmButtonText={mobileInfo.confirmButtonText}
          isHardMode={mobileInfo.isHardMode}
          messageWidth={900}
        />
      </ConfigProvider>
    </div>
  );
};
const productionMode = process.env.NODE_ENV === "production";

const router = createHashRouter(
  [
    {
      path: "/",
      element: <NavBarWrapper />,
      errorElement: productionMode && (
        <Result
          status="404"
          title="404"
          subTitle="Die Seite wurde nicht gefunden"
          extra={
            <Button type="primary" href="/">
              Zurück
            </Button>
          }
        />
      ),
      children: [
        {
          path: "/",
          element: <OverviewPage />,
        },
        {
          path: "/versiegelteFlaechen",
          element: <SealedSurfaceOverviewPage />,
        },
        {
          path: "/versiegelteFlaechen/details",
          element: <SealedSurfaceDetailsPage />,
        },
        {
          path: "/strassenreinigung",
          element: <StreetCleaningPage />,
        },
        {
          path: "/strassenreinigung/details",
          element: <StreetCleaningDetailsPage />,
        },
        {
          path: "/info",
          element: <InfoPage />,
        },
        {
          path: "/versickerungsgenehmigungen",
          element: <SeepagePermitsPage />,
        },
        {
          path: "/versickerungsgenehmigungen/details",
          element: <SeepagePermitsDetailsPage />,
        },
      ],
    },
    {
      path: "/login",
      element: <LoginPage />,
    },
    {
      path: "/alkis-flurstueck",
      element: (
        <AlkisNav
          name="VerDIS"
          logoPath={urlPrefix + logoSrc}
          style={{ height: "40px" }}
        >
          <AlkisLandparcelPage />
        </AlkisNav>
      ),
    },
    {
      path: "/alkis-buchungsblatt",
      element: (
        <AlkisNav
          name="VerDIS"
          logoPath={urlPrefix + logoSrc}
          style={{ height: "40px" }}
        >
          <AlkisBookingSheetPage />
        </AlkisNav>
      ),
    },
  ],
  {}
);

suppressReactCismapErrors();

const queryClient = new QueryClient();

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ConfigProvider
      theme={{
        token: {
          colorPrimary: "#E67843",
        },
      }}
      locale={locale}
    >
      <Provider store={store}>
        <QueryClientProvider client={queryClient}>
          <GazDataProvider config={gazDataConfig}>
            <SelectionProvider>
              <TopicMapContextProvider
                appKey="verdis-desktop.map"
                backgroundModes={backgroundModes}
                backgroundConfigurations={backgroundConfigurations}
                baseLayerConf={baseLayerConf}
                offlineCacheConfig={offlineConfig}
                additionalLayerConfiguration={additionalLayerConfiguration}
              >
                <PersistGate loading={null} persistor={persistor}>
                  <RouterProvider router={router} />
                </PersistGate>
              </TopicMapContextProvider>
            </SelectionProvider>
          </GazDataProvider>
        </QueryClientProvider>
      </Provider>
    </ConfigProvider>
  </React.StrictMode>
);
