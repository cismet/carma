import { MenuOutlined } from "@ant-design/icons";
import { Outlet } from "react-router-dom";
import UserBar from "./UserBar";

const NavBar = () => {
  return (
    <div className="bg-[#F1F1F1] flex justify-between w-full h-full min-h-screen overflow-clip">
      <div className="w-[230px] bg-white pl-2 pt-2">
        <span className="ml-2">Belis-desktop</span>
      </div>
      <div className="grow">
        <UserBar />
        <Outlet />
      </div>
    </div>
  );
};

export default NavBar;
