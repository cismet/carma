import { Menu } from "antd";
import { Outlet } from "react-router-dom";

const NavBar = () => {
  return (
    <div className="flex justify-between gap-3">
      <div className="w-[200px]">Left side</div>
      <div className="bg-[#F1F1F1]">
        <div>Top Navigation</div>
        <div className="ml-3">
          <Outlet />
        </div>
      </div>
    </div>
  );
};

export default NavBar;
