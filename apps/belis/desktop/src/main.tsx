import { StrictMode, useEffect, useState } from "react";
import * as ReactDOM from "react-dom/client";
import { GazDataProvider, SelectionProvider } from "@carma-apps/portals";
import { Navigate, RouterProvider, createHashRouter } from "react-router-dom";
import { Provider, useDispatch, useSelector } from "react-redux";
import Layout from "./components/commons/Layout";
import Login from "./components/pages/Login";
import store from "./store";
import persistStore from "redux-persist/es/persistStore";
import { PersistGate } from "redux-persist/integration/react";
import TopicMapContextProvider from "react-cismap/contexts/TopicMapContextProvider";
import MainPage from "./components/MainPage";
import { checkJWTValidation, getJWT } from "./store/slices/auth";
import type { UnknownAction } from "redux";

const persistor = persistStore(store);

const NavBarWrapper = () => {
  const dispatch = useDispatch();
  const jwt = useSelector(getJWT);
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

  return <Layout />;
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
    <Provider store={store}>
      <GazDataProvider>
        <SelectionProvider>
          <PersistGate loading={null} persistor={persistor}>
            <TopicMapContextProvider appKey="belis-desktop.map">
              <RouterProvider router={router} />
            </TopicMapContextProvider>
          </PersistGate>
        </SelectionProvider>
      </GazDataProvider>
    </Provider>
  </StrictMode>
);
