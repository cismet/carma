import { useEffect, useRef, useState } from "react";
import BelisMapLibWrapper from "./commons/BelisMapWrapper";
import { useSelector } from "react-redux";
import { getJWT } from "../store/slices/auth";

const MainPage = () => {
  const storedJWT = useSelector(getJWT);
  const parentRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const updateSize = () => {
      if (parentRef.current) {
        setDimensions({
          width: parentRef.current.clientWidth,
          height: parentRef.current.clientHeight,
        });
      }
    };

    updateSize();

    window.addEventListener("resize", updateSize);
    return () => window.removeEventListener("resize", updateSize);
  }, []);

  let refRoutedMap = useRef(null);
  return (
    <div ref={parentRef} className="ml-3 mt-3 h-[calc(98%-20px)]">
      <BelisMapLibWrapper
        refRoutedMap={refRoutedMap}
        width={dimensions.width}
        height={dimensions.height}
        jwt={storedJWT}
      />
    </div>
  );
};

export default MainPage;
