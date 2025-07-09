import { useEffect, useRef, useState } from "react";
import BelisMapLibWrapper from "./commons/BelisMapWrapper";
import { useSelector, useDispatch } from "react-redux";
import { getJWT } from "../store/slices/auth";
import { CustomCard } from "./commons/CustomCard";
import { loadObjectsIntoFeatureCollection } from "@carma-apps/belis-library";
import { DOMAIN, REST_SERVICE } from "../constants/belis";

// const testBb = {
//   bbPoly: {
//     type: "Polygon",
//     coordinates: [
//       [
//         [374315.3967299071, 5681617.287973755],
//         [374634.6955785103, 5681617.287973755],
//         [374634.6955785103, 5681446.4647464035],
//         [374315.3967299071, 5681446.4647464035],
//         [374315.3967299071, 5681617.287973755],
//       ],
//     ],
//     crs: { type: "name", properties: { name: "urn:ogc:def:crs:EPSG::25832" } },
//   },
// };

const testBb = {
  left: 801426.7152987025,
  top: 6669646.369240411,
  right: 801600.7886873365,
  bottom: 6669401.233302045,
};

const MainPage = () => {
  const dispatch = useDispatch();
  const storedJWT = useSelector(getJWT);
  const parentRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

  useEffect(() => {
    if (storedJWT) {
      dispatch(
        loadObjectsIntoFeatureCollection(
          {
            boundingBox: testBb,
            _inFocusMode: true,
            _zoom: 19,
            _overridingFilterState: null,
            jwt: storedJWT,
            onlineDataForcing: false,
          },
          REST_SERVICE,
          DOMAIN
        )
      );
    }
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
  }, [storedJWT]);

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
