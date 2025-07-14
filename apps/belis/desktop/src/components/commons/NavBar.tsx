import useComponentSize from "@rehooks/component-size";
import { Outlet } from "react-router-dom";
import UserBar from "./UserBar";
import SidebarMenu from "../ui/SidebarMenu";
import { useEffect, useRef } from "react";
import { useDispatch } from "react-redux";
import { setMenuWidth } from "../../store/slices/ui";
import { useWindowSize } from "@react-hook/window-size";

const NavBar = () => {
  const dispatch = useDispatch();
  let refUpperToolbar = useRef(null);
  let sizeU = useComponentSize(refUpperToolbar);
  const [windowWidth, windowHeight] = useWindowSize();
  useEffect(() => {
    dispatch(
      setMenuWidth({
        width: sizeU.width - 48,
        height: windowHeight - sizeU.height - 76 - 20,
      })
    );
  }, [sizeU, windowHeight]);
  return (
    <div className="bg-[#F1F1F1] flex justify-between w-full h-full min-h-screen overflow-clip">
      <SidebarMenu />
      <div className="grow">
        <UserBar innerRef={refUpperToolbar} />
        <Outlet />
      </div>
    </div>
  );
};

export default NavBar;
