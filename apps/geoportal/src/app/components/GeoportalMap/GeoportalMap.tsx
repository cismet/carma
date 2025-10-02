import { useCallback, useContext, useEffect, useMemo, useRef } from "react";
import { useDispatch, useSelector } from "react-redux";

import { TopicMapContext } from "react-cismap/contexts/TopicMapContextProvider";

import { useGeoportalOverlays } from "./utils/useOverlayHelpers";
import type { LeafletConfig } from "@carma/types";

import {
  selectViewerIsMode2d,
  setCurrentSceneStyle,
  useCesiumContext,
} from "@carma-mapping/engines/cesium";

import { useDispatchSachdatenInfoText } from "../../hooks/useDispatchSachdatenInfoText.ts";

import {
  getBackgroundLayer,
  getLayersIdle,
  setLayersIdle,
} from "../../store/slices/mapping.ts";
// no UI mode handling here; wrapper handles 2D-specific UI flows

import { useLocationChangeHandlers } from "./hooks/useLocationChangeHandlers.ts";
import { TopicMapComponentWrapper } from "./components/TopicMapComponentWrapper";
import CesiumMapComponentWrapper from "./components/CesiumMapComponentWrapper.tsx";

import { CESIUM_CONFIG, LEAFLET_CONFIG } from "../../config/app.config";
import type { CesiumConfig } from "@carma-mapping/engines/cesium";

import "cesium/Build/Cesium/Widgets/widgets.css";
import "../leaflet.css";

interface MapProps {
  height: number;
  width: number;
  allow3d?: boolean;
  options?: {
    topicmap?: Partial<LeafletConfig>;
    cesium?: Partial<CesiumConfig>;
  };
}

export const GeoportalMap = ({ height, width, allow3d, options }: MapProps) => {
  const dispatch = useDispatch();

  const cesiumOptions = options?.cesium ?? CESIUM_CONFIG;
  const leafletOptions = options?.topicmap ?? LEAFLET_CONFIG;

  // Contexts
  const ctx = useCesiumContext();
  // using ctx.isValidViewer() below

  const rerenderCountRef = useRef(0);
  const lastRenderTimeStampRef = useRef(Date.now());
  const lastRenderIntervalRef = useRef(0);
  // 3D container is handled inside CesiumMapComponentWrapper

  // State and Selectors
  const backgroundLayer = useSelector(getBackgroundLayer);
  const isMode2d = useSelector(selectViewerIsMode2d) || !allow3d;

  useGeoportalOverlays();

  const { routedMapRef: topicMap } =
    useContext<typeof TopicMapContext>(TopicMapContext);

  const getTopicMap = useCallback(
    () => topicMap?.leafletMap?.leafletElement,
    [topicMap]
  );

  // topicMapLocationChangedHandler callbacks
  const layersIdle = useSelector(getLayersIdle);

  const changeHandlerOptions = useMemo(() => {
    const updateLayersIdleState = () => {
      if (layersIdle) {
        console.debug("Layers are idle, setting layers idle to false");
        dispatch(setLayersIdle(false));
      }
    };
    return {
      topicMap: {
        getInstance: getTopicMap,
        onAfter: updateLayersIdleState,
      },
    };
  }, [getTopicMap, layersIdle, dispatch]);

  const { topicMapLocationChangedHandler, cesiumLocationChangedHandler } =
    useLocationChangeHandlers(isMode2d, changeHandlerOptions);

  useDispatchSachdatenInfoText();

  useEffect(() => {
    if (ctx.isValidViewer() && backgroundLayer) {
      if (backgroundLayer.id === "luftbild") {
        dispatch(setCurrentSceneStyle("primary"));
      } else {
        dispatch(setCurrentSceneStyle("secondary"));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backgroundLayer]);

  const now = Date.now();
  const intervalMs = now - lastRenderTimeStampRef.current;
  const nextCount = rerenderCountRef.current + 1;
  console.debug("RENDER: [GEOPORTAL] MAP", {
    isMode2d,
    count: nextCount,
    intervalMs,
  });
  rerenderCountRef.current = nextCount;
  lastRenderIntervalRef.current = intervalMs;
  lastRenderTimeStampRef.current = now;

  return (
    <>
      <TopicMapComponentWrapper
        height={height}
        width={width}
        locationChangedHandler={topicMapLocationChangedHandler}
        leafletOptions={leafletOptions}
      />
      <CesiumMapComponentWrapper
        allow3d={allow3d}
        cesiumOptions={cesiumOptions}
        onSceneChange={cesiumLocationChangedHandler}
      />
    </>
  );
};

export default GeoportalMap;
