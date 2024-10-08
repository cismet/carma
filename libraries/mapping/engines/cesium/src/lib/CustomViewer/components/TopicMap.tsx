import { useEffect, useRef } from "react";

import TopicMapComponent from "react-cismap/topicmaps/TopicMapComponent";
import StyledWMSTileLayer from "react-cismap/StyledWMSTileLayer";

import {
  useShowPrimaryTileset,
  useViewerIsMode2d,
} from "../../CesiumContextProvider/slices/cesium";
import { leafletToCesiumCamera } from "../../utils";
import { useCesiumContext } from "../../CesiumContextProvider";

// TODO sync this setting across app
const DEFAULT_MODE_2D_3D_CHANGE_FADE_DURATION = 1000;

// TODO remove this component replace with cesium overlayed on provied leaflet instance
export const TopicMap = ({ forceShow = false } = {}) => {
  const { viewer } = useCesiumContext();
  const isPrimaryStyle = useShowPrimaryTileset();
  const isMode2d = useViewerIsMode2d();

  const componentRef = useRef<null | HTMLDivElement>(null);

  const isFocused = useRef<boolean>(false);

  useEffect(() => {
    const node = componentRef.current;
    if (node) {
      const handleFocus = () => (isFocused.current = true);
      const handleBlur = () => (isFocused.current = false);

      node.addEventListener("focusin", handleFocus);
      node.addEventListener("focusout", handleBlur);
      node.addEventListener("wheel", handleFocus, true);

      return () => {
        node.removeEventListener("focusin", handleFocus);
        node.removeEventListener("focusout", handleBlur);
        node.removeEventListener("wheel", handleFocus);
      };
    }
    return;
  }, []);

  const handleLeafletLocationChange = (event: {
    lat: number;
    lng: number;
    zoom: number;
  }) => {
    console.log("handleLeafletLocationChange", event, isFocused.current);
    if (!isFocused.current) {
      return;
    }
    if (viewer) {
      // TODO Not needed with only leaflet visible, reenable for split/transparent view
      //leafletToCesiumCamera(viewer, event, {cause: "Leaflet location Change"});
    }
  };

  const primaryLayerRef = useRef<any>(null);
  const secondaryLayerRef = useRef<any>(null);

  useEffect(() => {
    if (primaryLayerRef.current && primaryLayerRef.current.leafletElement) {
      console.log("tileLayerRef1.current", primaryLayerRef.current);
      primaryLayerRef.current.leafletElement.setOpacity(isPrimaryStyle ? 1 : 0);
    }
    if (secondaryLayerRef.current && secondaryLayerRef.current.leafletElement) {
      secondaryLayerRef.current.leafletElement.setOpacity(
        isPrimaryStyle ? 0 : 1,
      );
    }
  }, [isPrimaryStyle]);

  console.log("RENDER: TopicMap isMode2d", isMode2d);

  return (
    <div
      ref={componentRef}
      style={{
        opacity: isMode2d || forceShow ? 1 : 0,
        transition: `opacity ${DEFAULT_MODE_2D_3D_CHANGE_FADE_DURATION}ms ease-in-out`,
        pointerEvents: isMode2d || forceShow ? "auto" : "none",
      }}
      //className={isMode2d ? 'fade-in' : 'fade-out'}
    >
      <TopicMapComponent
        gazData={[]}
        backgroundlayers="empty"
        hamburgerMenu={false}
        fullScreenControlEnabled={false}
        zoomSnap={0.5} // TODO fix zoom snapping in TopicMap Component
        zoomDelta={0.5}
        locationChangedHandler={handleLeafletLocationChange}
        //zoomControls={true}
        //fullScreenControl={false}
      >
        <StyledWMSTileLayer
          {...{
            ref: primaryLayerRef,
            //url: 'https://maps.wuppertal.de/karten',
            //layers: 'R102:trueortho2022',
            url: "https://www.wms.nrw.de/geobasis/wms_nw_dop",
            layers: "nw_dop_rgb",
            type: "wms",
            format: "image/png",
            tiled: true,
            maxZoom: 22,
            version: "1.1.1",
            pane: "backgroundLayers",
            opacity: 1,
          }}
        ></StyledWMSTileLayer>

        <StyledWMSTileLayer
          {...{
            ref: secondaryLayerRef,
            type: "wmts",
            url: "https://geodaten.metropoleruhr.de/spw2/service",
            layers: "spw2_graublau",
            version: "1.3.0",
            tileSize: 512,
            transparent: true,
            opacity: 0,
          }}
        ></StyledWMSTileLayer>
      </TopicMapComponent>
    </div>
  );
};

export default TopicMap;
