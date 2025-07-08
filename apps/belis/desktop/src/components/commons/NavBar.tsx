import { Menu } from "antd";
import { Outlet } from "react-router-dom";

const NavBar = () => {
  return (
    <div className="flex justify-between gap-3 w-full h-full min-h-screen overflow-clip px-2">
      <div className="w-[200px] mt-2">Belis-desktop</div>
      <div className="grow bg-[#F1F1F1]">
        <div className="mx-3 mt-2">Top navbar</div>
        <Outlet />
      </div>
    </div>
  );
};

export default NavBar;
