import { CarmaMap } from "@carma-appframeworks/portals";
import { useDispatch } from "react-redux";
import { setSelectedFeature } from "../../store/slices/featureCollection";
import { AppDispatch } from "../../store";

const BelisMapLibWrapper = ({ mapSizes }) => {
  const dispatch: AppDispatch = useDispatch();

  const handleSelectedFeature = (feature) => {
    if (feature) {
      const updatedFeature = { ...feature, selected: true };
      dispatch(setSelectedFeature(updatedFeature));
      console.log("xxx feature", updatedFeature);
    }
  };

  return (
    <div className="relative" style={{ width: mapSizes.width, height: mapSizes.height }}>
      <CarmaMap
        mapEngine="maplibre"
        embedded
        terrainControl={false}
        fullScreenControl={false}
        libreLayers={[
          {
            type: "vector",
            name: "Leuchten",
            style: "https://tiles.cismet.de/belis/style.json",
          },
        ]}
        onFeatureSelect={handleSelectedFeature}
      />
    </div>
  );
};

export default BelisMapLibWrapper;
