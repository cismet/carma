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
import { useDispatch, useSelector } from "react-redux";
import NavBar from "./components/commons/NavBar";
import Login from "./components/pages/Login";

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
          element: <div>Main</div>,
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
    <GazDataProvider>
      <SelectionProvider>
        <RouterProvider router={router} />
      </SelectionProvider>
    </GazDataProvider>
  </StrictMode>
);
