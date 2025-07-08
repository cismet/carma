import { useEffect, useRef, useState } from "react";
import BelisMapLibWrapper from "./commons/BelisMapWrapper";
import { useSelector } from "react-redux";
import { getJWT } from "../store/slices/auth";
import { CustomCard } from "./commons/CustomCard";

const MainPage = () => {
  const storedJWT = useSelector(getJWT);
  const parentRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const updateSize = () => {
      const gutter = 230;
      setDimensions({
        width: window.innerWidth - gutter,
        height: window.innerHeight - 116,
      });
    };
    updateSize();
    window.addEventListener("resize", updateSize);
    return () => window.removeEventListener("resize", updateSize);
  }, []);

  let refRoutedMap = useRef(null);
  return (
    <div ref={parentRef} className="mx-3 mt-1 h-[calc(91%-20px)]">
      <CustomCard title="Karte" style={{ marginBottom: "1rem" }}>
        <BelisMapLibWrapper
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
