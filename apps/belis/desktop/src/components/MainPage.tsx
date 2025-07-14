import { useEffect, useRef, useState } from "react";
import BelisMapLibWrapper from "./commons/BelisMapWrapper";
import { useSelector, useDispatch } from "react-redux";
import { getJWT } from "../store/slices/auth";
import { CustomCard } from "./commons/CustomCard";
import { AppDispatch } from "../store";
import { getIsMenuCollapsed } from "../store/slices/ui";

const MainPage = () => {
  const dispatch: AppDispatch = useDispatch();
  const storedJWT = useSelector(getJWT);
  const collapsed = useSelector(getIsMenuCollapsed);
  const parentRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const updateSize = () => {
      const gutter = !collapsed ? 253 : 168;
      setDimensions({
        width: window.innerWidth - gutter,
        height: window.innerHeight - 136,
      });
    };
    updateSize();
    window.addEventListener("resize", updateSize);
    return () => window.removeEventListener("resize", updateSize);
  }, [collapsed]);

  let refRoutedMap = useRef(null);
  // h-[calc(90%-20px)]
  return (
    <div ref={parentRef} className="mx-3 mt-1">
      <CustomCard title="Karte" style={{ marginBottom: "8px" }}>
        <BelisMapLibWrapper
          key={`Belis-Desktop-Map-${dimensions.width}-${dimensions.height}`}
          refRoutedMap={refRoutedMap}
          width={dimensions.width}
          height={dimensions.height}
          jwt={storedJWT}
        />
      </CustomCard>
    </div>
  );
};

export default MainPage;
