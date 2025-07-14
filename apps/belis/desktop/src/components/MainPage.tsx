import { useRef } from "react";
import BelisMapLibWrapper from "./commons/BelisMapWrapper";
import { useSelector } from "react-redux";
import { getJWT } from "../store/slices/auth";
import { CustomCard } from "./commons/CustomCard";
import TopNavbar from "./commons/TopNavbar";
import useComponentSize from "@rehooks/component-size";
import { useWindowSize } from "@react-hook/window-size";
import { getIsMenuCollapsed } from "../store/slices/ui";

const MainPage = () => {
  const storedJWT = useSelector(getJWT);
  const isCollapsed = useSelector(getIsMenuCollapsed);
  let refUpperToolbar = useRef(null);
  let sizeU = useComponentSize(refUpperToolbar);
  const [windowWidth, windowHeight] = useWindowSize();
  useComponentSize(refUpperToolbar);
  let refRoutedMap = useRef(null);
  const menuWidth = !isCollapsed ? 204 : 72;
  const cardGaps = 24 + 24 + 1;

  const mapStyle = {
    height: windowHeight - sizeU.height - 76 - 20,
    width: windowWidth - menuWidth - cardGaps,
    cursor: "pointer",
    clear: "both",
  };

  return (
    <>
      <TopNavbar innerRef={refUpperToolbar} />
      <div className="mx-3 mt-1">
        <CustomCard title="Karte" style={{ marginBottom: "8px" }}>
          <BelisMapLibWrapper
            refRoutedMap={refRoutedMap}
            jwt={storedJWT}
            mapSizes={mapStyle}
          />
        </CustomCard>
      </div>
    </>
  );
};

export default MainPage;
