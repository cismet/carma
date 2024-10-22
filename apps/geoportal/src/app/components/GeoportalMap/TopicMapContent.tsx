import { useContext, useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Map as LeafletMap } from "leaflet";

import { ExtraMarker } from "react-cismap/ExtraMarker";
import PaleOverlay from "react-cismap/PaleOverlay";
import GazetteerHitDisplay from "react-cismap/GazetteerHitDisplay";
import { ProjSingleGeoJson } from "react-cismap/ProjSingleGeoJson";
import { createCismapLayers } from "./topicmap.utils";
import { getFocusMode } from "../../store/slices/mapping";
import { TopicMapContext } from "react-cismap/contexts/TopicMapContextProvider";
import { getBackgroundLayers } from "../../helper/layer";
import { getUIMode, UIMode } from "../../store/slices/ui";

const TopicMapContent = ({
  backgroundLayer,
  layers,
  overlayFeature,
  gazetteerHit,
  pos,
  setPos,
}) => {
  const dispatch = useDispatch();
  const focusMode = useSelector(getFocusMode);
  const uiMode = useSelector(getUIMode);
  const isModeFeatureInfo = uiMode === UIMode.FEATURE_INFO;
  const [leafletElement, setLeafletElement] = useState<LeafletMap | null>(null);

  const {
    routedMapRef,

    maskingPolygon,
  } = useContext<typeof TopicMapContext>(TopicMapContext);

  useEffect(() => {
    if (routedMapRef?.leafletMap) {
      setLeafletElement(routedMapRef.leafletMap.leafletElement);
    }
  }, [routedMapRef]);

  if (!leafletElement) {
    return null;
  }

  console.log("RENDER: TopicMapContent");
  return (
    <>
      {backgroundLayer &&
        backgroundLayer.visible &&
        getBackgroundLayers({
          layerString: backgroundLayer.layers,
        })}
      {overlayFeature && (
        <ProjSingleGeoJson
          key={JSON.stringify(overlayFeature)}
          geoJson={overlayFeature}
          masked={true}
          maskingPolygon={maskingPolygon}
          mapRef={routedMapRef}
        />
      )}
      <GazetteerHitDisplay
        key={"gazHit" + JSON.stringify(gazetteerHit)}
        gazetteerHit={gazetteerHit}
      />
      {focusMode && <PaleOverlay />}
      {createCismapLayers(layers, {
        focusMode,
        mode: uiMode,
        dispatch,
        setPos,
        zoom: leafletElement.getZoom(),
      })}
      {pos && isModeFeatureInfo && layers.length > 0 && (
        <ExtraMarker
          markerOptions={{ markerColor: "cyan", spin: false }}
          position={pos}
        />
      )}
    </>
  );
};

export default TopicMapContent;
