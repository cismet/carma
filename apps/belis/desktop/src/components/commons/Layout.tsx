import { Outlet } from "react-router-dom";
import PhotoLightBox from "react-cismap/topicmaps/PhotoLightbox";
import TopNavbar from "./TopNavbar";

const Layout = () => {
  return (
    <div className="bg-[#F1F1F1] flex flex-col w-full h-full min-h-screen overflow-clip">
      <PhotoLightBox
        reactModalStyleOverride={{ overlay: { zIndex: 60000000 } }}
      />
      <TopNavbar />
      <div className="w-full flex-1">
        <Outlet />
      </div>
    </div>
  );
};

export default Layout;
