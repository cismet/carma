import { Outlet } from "react-router-dom";
import PhotoLightbox from "../ui/PhotoLightbox";
import TopNavbar from "./TopNavbar";

const Layout = () => {
  return (
    <div className="bg-[#F1F1F1] flex flex-col w-full h-full min-h-screen overflow-clip">
      <PhotoLightbox
        reactModalStyleOverride={{ overlay: { zIndex: 60000000 } }}
        animationDuration={200}
      />
      <TopNavbar />
      <div className="w-full flex-1">
        <Outlet />
      </div>
    </div>
  );
};

export default Layout;
