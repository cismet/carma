import {
  useGazData,
  useSelection,
  useSelectionTopicMap,
} from "@carma-apps/portals";
import { LibFuzzySearch } from "@carma-mapping/fuzzy-search";
import { ResponsiveTopicMapContext } from "react-cismap/contexts/ResponsiveTopicMapContextProvider";
import { useContext } from "react";
import { isAreaType } from "@carma-commons/resources";
import proj4 from "proj4";
import { proj4crs3857def, proj4crs4326def } from "@carma-mapping/utils";

const FuzzySearchWrapper = ({
  featureGazData,
  placeholder,
  clickAfterGazetteerHit = true,
}) => {
  const { responsiveState, gap, windowSize } = useContext(
    ResponsiveTopicMapContext
  );

  const pixelwidth =
    responsiveState === "normal" ? "300px" : windowSize.width - gap;
  const { gazData } = useGazData();
  const commonGazData = [...featureGazData, ...gazData];

  const { setSelection } = useSelection();
  const { routedMapRef: routedMap } = useSelectionTopicMap() ?? {};

  const onGazetteerSelection = (selection) => {
    if (!selection) {
      setSelection(null);
      return;
    }
    const selectionMetaData = {
      selectedFrom: "gazetteer",
      selectionTimestamp: Date.now(),
      isAreaSelection: isAreaType(selection.type),
    };
    setSelection(Object.assign({}, selection, selectionMetaData));
    if (routedMap && clickAfterGazetteerHit) {
      setTimeout(() => {
        const map = routedMap.leafletMap.leafletElement;
        const selectedPos = proj4(proj4crs3857def, proj4crs4326def, [
          selection.x,
          selection.y,
        ]);
        const updatedPos = { lat: selectedPos[1], lng: selectedPos[0] };
        const latlngPoint = L.latLng(updatedPos);

        if (map) {
          map.fireEvent("click", {
            latlng: latlngPoint,
            layerPoint: map.latLngToLayerPoint(latlngPoint),
            containerPoint: map.latLngToContainerPoint(latlngPoint),
          });
        }
      }, 300);
    }
  };

  return (
    <>
      {gazData.length > 0 && (
        <div className="custom-left-control">
          <LibFuzzySearch
            gazData={commonGazData}
            onSelection={onGazetteerSelection}
            pixelwidth={
              responsiveState === "normal" ? "300px" : windowSize.width - gap
            }
            placeholder={placeholder || "Wohin?"}
          />
        </div>
      )}
    </>
  );
};

export default FuzzySearchWrapper;
