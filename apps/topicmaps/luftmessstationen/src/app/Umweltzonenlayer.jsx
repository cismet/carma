import { FeatureCollectionDisplayWithTooltipLabels } from "react-cismap";
import { useEffect, useContext, useState } from "react";
import { TopicMapContext } from "react-cismap/contexts/TopicMapContextProvider";
import { md5FetchJSON } from "react-cismap/tools/fetching";

const host = import.meta.env.VITE_WUPP_ASSET_BASEURL;
const getUWZ = async (setUWZ) => {
  const uwz = await md5FetchJSON("MapData", host + "/data/umweltzonen.json");
  setUWZ(uwz);
};

const UWZ = () => {
  const [uwz, setUWZ] = useState([]);
  const { location } = useContext(TopicMapContext);
  useEffect(() => {
    getUWZ(setUWZ);
  }, []);

  return (
    <FeatureCollectionDisplayWithTooltipLabels
      key={"ds"}
      featureCollection={uwz}
      style={(feature) => {
        const style = {
          color: "#155317",
          weight: 3,
          opacity: 0.5,
          fillColor: "#155317",
          fillOpacity: 0.15,
        };
        return style;
      }}
      labeler={(feature) => {
        const currentZoom = location?.zoom || 8;
        if (currentZoom > 7) {
          return (
            <h3
              style={{
                color: "#155317",
                opacity: 0.7,
                textShadow:
                  "1px 1px 0px  #000000,-1px 1px 0px  #000000, 1px -1px 0px  #000000, -1px -1px 0px  #000000, 2px 2px 15px #000000",
              }}
            >
              Umweltzone
            </h3>
          );
        }
      }}
      featureClickHandler={() => {}}
    />
  );
};
export default UWZ;
