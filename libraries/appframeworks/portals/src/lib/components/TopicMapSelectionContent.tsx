import { useContext } from "react";
import { ProjSingleGeoJson } from "react-cismap/ProjSingleGeoJson";
import GazetteerHitDisplay from "react-cismap/GazetteerHitDisplay";
import { useSelection } from "./SelectionProvider";
import { TopicMapContext } from "react-cismap/contexts/TopicMapContextProvider";

export const TopicMapSelectionContent = () => {
  const { selection, overlayFeature } = useSelection();

  //console.debug("RENDER TopicMapSelectionContent", selection, overlayFeature);

  const {
    routedMapRef: routedMap,
    //realRoutedMapRef: routeMapRef,
    //referenceSystem,
    //referenceSystemDefinition,
    maskingPolygon,
  } = useContext<typeof TopicMapContext>(TopicMapContext);

  if (!selection) {
    return null;
  }

  if (selection.isAreaSelection) {
    return (
      overlayFeature && (
        <ProjSingleGeoJson
          key={JSON.stringify(overlayFeature)}
          geoJson={overlayFeature}
          masked={true}
          maskingPolygon={maskingPolygon}
          mapRef={routedMap}
        />
      )
    );
  } else {
    return (
      <GazetteerHitDisplay
        key={"gazHit" + JSON.stringify(selection)}
        gazetteerHit={selection}
      />
    );
  }
};
