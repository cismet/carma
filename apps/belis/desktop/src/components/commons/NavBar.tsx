import { Menu } from "antd";
import { Outlet } from "react-router-dom";

const NavBar = () => {
  return (
    <div className="flex justify-between gap-3 w-full h-full min-h-screen overflow-clip p-2">
      <div className="w-[200px]">Belis-desktop</div>
      <div className="grow bg-[#F1F1F1]">
        <div className="ml-3">Top navbar</div>
        <Outlet />
      </div>
    </div>
  );
};

export default NavBar;
