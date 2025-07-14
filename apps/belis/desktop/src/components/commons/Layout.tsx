import { Outlet } from "react-router-dom";
import SidebarMenu from "../ui/SidebarMenu";

const Layout = () => {
  return (
    <div className="bg-[#F1F1F1] flex justify-between w-full h-full min-h-screen overflow-clip">
      <SidebarMenu />
      <div className="grow">
        <Outlet />
      </div>
    </div>
  );
};

export default Layout;
