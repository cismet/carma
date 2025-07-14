import { useRef } from "react";
import BelisMapLibWrapper from "./commons/BelisMapWrapper";
import { useSelector } from "react-redux";
import { getJWT } from "../store/slices/auth";
import { CustomCard } from "./commons/CustomCard";
import UserBar from "./commons/UserBar";
import useComponentSize from "@rehooks/component-size";
import { useWindowSize } from "@react-hook/window-size";

const MainPage = () => {
  const storedJWT = useSelector(getJWT);
  let refUpperToolbar = useRef(null);
  let sizeU = useComponentSize(refUpperToolbar);
  const [windowWidth, windowHeight] = useWindowSize();
  useComponentSize(refUpperToolbar);
  let refRoutedMap = useRef(null);
  // h-[calc(90%-20px)]

  const mapStyle = {
    height: windowHeight - sizeU.height - 76 - 20,
    width: sizeU.width - 36,
    cursor: "pointer",
    clear: "both",
  };

  return (
    <>
      <UserBar innerRef={refUpperToolbar} />
      <div className="mx-3 mt-1 overflow-clip">
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
