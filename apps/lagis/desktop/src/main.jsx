import React, { useEffect } from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import "antd/dist/reset.css";
import "bootstrap/dist/css/bootstrap.min.css";
import "react-bootstrap-typeahead/css/Typeahead.css";
import { Provider, useDispatch, useSelector } from "react-redux";
import store from "./store";
import { ConfigProvider } from "antd";
import { RouterProvider, createHashRouter } from "react-router-dom";
import locale from "antd/locale/de_DE";
import ErrorPage from "./components/ui/errors-template/ErrorsPage";
import Overview from "./pages/Overview";
import AppLayout from "./pages/AppLayout";
import Offices from "./pages/Offices";
import RentAndLease from "./pages/RentAndLease";
import RightsPage from "./pages/RightsPage";
import UsagePage from "./pages/UsagePage";
import OperationsPage from "./pages/OperationsPage";
import HistoryPage from "./pages/HistoryPage";
import Transaction from "./pages/Transaction";
import DMSPage from "./pages/DMSPage";
import LoginPage from "./components/Login/LoginPage";
import { Navigate } from "react-router-dom";
import { persistStore } from "redux-persist";
import { PersistGate } from "redux-persist/integration/react";
import { getJWT } from "./store/slices/auth";
import { QueryClient } from "@tanstack/react-query";
import TopicMapContextProvider from "react-cismap/contexts/TopicMapContextProvider";

import { loadGazeteerEntries } from "./store/slices/gazData";

const NavBarWrapper = () => {
  const dispatch = useDispatch();
  const jwt = useSelector(getJWT);
  if (!jwt) {
    return <Navigate to="/login" />;
  }
  useEffect(() => {
    dispatch(loadGazeteerEntries());
  }, []);
  return <AppLayout />;
};
const productionMode = process.env.NODE_ENV === "production";

const router = createHashRouter([
  {
    path: "/",
    element: <NavBarWrapper />,
    errorElement: productionMode && <ErrorPage />,
    children: [
      {
        path: "/",
        element: <Overview />,
      },
      {
        path: "/verwaltungsbereiche",
        element: <Offices />,
      },
      {
        path: "/miet",
        element: <RentAndLease />,
      },
      {
        path: "/rechte",
        element: <RightsPage />,
      },
      {
        path: "/nutzung",
        element: <UsagePage />,
      },
      {
        path: "/vorgange",
        element: <OperationsPage />,
      },
      {
        path: "/historie",
        element: <HistoryPage />,
      },
      {
        path: "/kassenzeichen",
        element: <Transaction />,
      },
      {
        path: "/dms",
        element: <DMSPage />,
      },
    ],
  },
  {
    path: "/login",
    element: <LoginPage />,
  },
]);
const queryClient = new QueryClient();
const persistor = persistStore(store);
ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ConfigProvider locale={locale}>
      <Provider store={store}>
        <TopicMapContextProvider appKey="lagis-desktop.map">
          <PersistGate locale={locale} loading={null} persistor={persistor}>
            <RouterProvider router={router} />
          </PersistGate>
        </TopicMapContextProvider>
      </Provider>
    </ConfigProvider>
  </React.StrictMode>
);
