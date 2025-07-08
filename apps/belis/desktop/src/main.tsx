import { StrictMode, useEffect } from "react";
import * as ReactDOM from "react-dom/client";
import { GazDataProvider, SelectionProvider } from "@carma-apps/portals";
import App from "./App";
import {
  Navigate,
  Outlet,
  RouterProvider,
  createHashRouter,
  useLocation,
} from "react-router-dom";
import { Provider, useDispatch, useSelector } from "react-redux";
import NavBar from "./components/commons/NavBar";
import Login from "./components/pages/Login";
import store from "./store";
import persistStore from "redux-persist/es/persistStore";
import { PersistGate } from "redux-persist/integration/react";
import TopicMapContextProvider from "react-cismap/contexts/TopicMapContextProvider";
import MainPage from "./components/MainPage";

const persistor = persistStore(store);

const NavBarWrapper = () => {
  // const dispatch = useDispatch();
  // const jwt = useSelector(getJWT);
  // if (!jwt) {
  //   return <Navigate to="/login" />;
  // }
  useEffect(() => {
    // dispatch(loadGazeteerEntries());
  }, []);
  return (
    <div>
      <NavBar />
      <Outlet />
    </div>
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
