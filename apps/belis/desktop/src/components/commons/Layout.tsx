import { Outlet } from "react-router-dom";
import TopNavbar from "./TopNavbar";
import BelisMapPageShell from "./BelisMapPageShell";
import { MapPageProvider, useMapPage } from "../../contexts/MapPageContext";

const LayoutContent = () => {
  const { config } = useMapPage();

  return (
    <div className="bg-[#F1F1F1] flex flex-col w-full h-screen overflow-hidden">
      <TopNavbar />
      <div className="w-full flex-1">
        {/* Always mounted — display:none preserves map state across route changes */}
        <div style={{ display: config.isMapRoute ? "block" : "none" }}>
          <BelisMapPageShell />
        </div>
        {/* Non-map pages render here; map route components return null */}
        <Outlet />
      </div>
    </div>
  );
};

const Layout = () => (
  <MapPageProvider>
    <LayoutContent />
  </MapPageProvider>
);

export default Layout;
