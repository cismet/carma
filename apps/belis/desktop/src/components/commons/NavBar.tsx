import { MenuOutlined } from "@ant-design/icons";
import { Outlet } from "react-router-dom";
import UserBar from "./UserBar";

const NavBar = () => {
  return (
    <div className="bg-[#F1F1F1] flex justify-between w-full h-full min-h-screen overflow-clip">
      <div className="w-[250px] bg-white pl-2 pt-2">
        <span className="cursor-pointer">
          <MenuOutlined style={{ textAlign: "left" }} />
        </span>
        <span className="ml-2">Belis-desktop</span>
      </div>
      <div className="grow">
        {/* <div className="mx-3 mt-2">Top navbar</div> */}
        <UserBar />
        <Outlet />
      </div>
    </div>
  );
};

export default NavBar;
