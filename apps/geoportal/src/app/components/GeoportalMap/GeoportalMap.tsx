import { useContext, useEffect, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";

import { Tooltip } from "antd";

import { faEyeSlash } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { ResponsiveTopicMapContext } from "react-cismap/contexts/ResponsiveTopicMapContextProvider";

import {
  CesiumMapComponentWrapper,
  usePortal,
} from "@carma-appframeworks/portals";
import { detectWebGLContext } from "@carma-commons/dom/canvas";

import { useCarmaTopicMapContext } from "@carma-mapping/engines/carma-cismap";
import { useCesiumContext, CtxEvent } from "@carma-mapping/engines/cesium/core";

import {
  Control,
  ControlLayout,
  ControlLayoutCanvas,
} from "@carma-mapping/map-controls-layout";
import { useFeatureFlags } from "@carma/providers/feature-flag";

import { TopicMapComponentWrapper } from "./components/TopicMapComponentWrapper";
import { GeoportalControls } from "./GeoportalControls";
import { useGeoportalOverlays } from "./hooks/useGeoportalOverlays";
import LibreGeoportalMap from "./LibreGeoportalMap.tsx";
// import { CesiumObliqueMode } from "../../CesiumObliqueMode.tsx";

import { useDispatchSachdatenInfoText } from "../../hooks/useDispatchSachdatenInfoText.ts";
import { useFeatureInfoModeCursorStyle } from "../../hooks/useFeatureInfoModeCursorStyle.ts";
import { useWindowSize } from "../../hooks/useWindowSize.ts";

import {
  getConfigSelection,
  getLibreMapRef,
} from "../../store/slices/mapping.ts";
import { getUIAllow3d, getZenMode, setZenMode } from "../../store/slices/ui.ts";

// detect GPU support, disables 3d mode if not supported
let hasGPU = false;
const setHasGPU = (flag: boolean) => (hasGPU = flag);
const testGPU = () => detectWebGLContext(setHasGPU);
window.addEventListener("load", testGPU, false);

// TODO: centralize the hash params update behavior

export const GeoportalMap = () => {
  const dispatch = useDispatch();
  const flags = useFeatureFlags();
  const { emit: emitCesium, isSuspendedRef } = useCesiumContext();
  const { emit: emitTopicMap, leafletMapRef } = useCarmaTopicMapContext();

  const showLibreMap = flags.featureFlagLibreMap;

  const wrapperRef = useRef<HTMLDivElement>(null);

  // State and Selectors
  const libreMapRef = useSelector(getLibreMapRef);
  const allow3d = useSelector(getUIAllow3d) && hasGPU;

  // Get map mode from PortalProvider context
  const { currentEngine } = usePortal();
  const isMode2d = currentEngine === "leaflet2d";
  const zenMode = useSelector(getZenMode);
  const configSelection = useSelector(getConfigSelection);

  const contextValue = useContext(ResponsiveTopicMapContext) as any;
  const { responsiveState, gap, windowSize } = contextValue ?? {};

  const [isLocationActive, setIsLocationActive] = useState(false);
  const [hasMapMoved, setHasMapMoved] = useState(false);
  const [hasFoundLocation, setHasFoundLocation] = useState(false);

  const [zenButtonHidden, setZenButtonHidden] = useState(false);
  const [isHoveringZenButton, setIsHoveringZenButton] = useState(false);

  useEffect(() => {
    const map = leafletMapRef.current;
    if (map) {
      const handleMapMove = () => {
        if (isLocationActive && hasFoundLocation) {
          setHasMapMoved(true);
        }
      };

      const handleLocationFound = () => {
        setTimeout(() => {
          setHasFoundLocation(true);
        }, 300);
      };

      map.on("dragend zoomend", handleMapMove);
      map.on("locationfound", handleLocationFound);

      return () => {
        map.off("dragend", handleMapMove);
        map.off("zoomend", handleMapMove);
        map.off("locationfound", handleLocationFound);
      };
    }
  }, [leafletMapRef, isLocationActive, hasFoundLocation]);

  useEffect(() => {
    if (!isLocationActive) {
      setHasMapMoved(false);
      setHasFoundLocation(false);
    }
  }, [isLocationActive]);

  useEffect(() => {
    if (zenMode && !zenButtonHidden && !isHoveringZenButton) {
      const timer = setTimeout(() => {
        setZenButtonHidden(true);
      }, 2000);

      return () => clearTimeout(timer);
    }
  }, [zenMode, zenButtonHidden, isHoveringZenButton]);

  // custom hooks
  useDispatchSachdatenInfoText();
  useGeoportalOverlays();
  // useMapStyleReduxSync() - now handled by PortalReduxSyncProvider

  const { width, height } = useWindowSize(wrapperRef);

  useFeatureInfoModeCursorStyle();

  useEffect(() => {
    // Suspend Cesium if 3D is not allowed
    if (allow3d === false || allow3d === undefined) {
      emitCesium(CtxEvent.Suspend, undefined);
    }
  }, [allow3d, emitCesium]);

  console.debug(
    `[MapWrapper] Render isMode2d: ${isMode2d}, allow3d: ${allow3d}`
  );

  return (
    <ControlLayout>
      {zenMode ? (
        <Control position="topcenter" order={10}>
          <button
            className={`text-xl size-16 hover:text-gray-600 button-shadow bg-white/80 rounded-md transition-all duration-300`}
            onClick={() => {
              if (zenButtonHidden) {
                setZenButtonHidden(false);
              } else {
                setIsHoveringZenButton(false);
                dispatch(setZenMode(false));
              }
            }}
            onMouseEnter={() => setIsHoveringZenButton(true)}
            onMouseLeave={() => setIsHoveringZenButton(false)}
            // make sure the shadow is still visible after click
            onMouseDown={(e) => e.preventDefault()}
            style={{
              transform: zenButtonHidden ? "translateY(-87%)" : "translateY(0)",
            }}
            data-test-id="zen-mode-btn"
          >
            <Tooltip
              title={
                <span>
                  Bedienelemente einblenden
                  <br />
                  (Zen-Modus beenden)
                </span>
              }
            >
              <FontAwesomeIcon fixedWidth={true} icon={faEyeSlash} />
            </Tooltip>
          </button>
        </Control>
      ) : (
        <div className="pt-16">
          {/* adds padding for topnavbar*/}
          <GeoportalControls
            isMode2d={isMode2d}
            allow3d={allow3d}
            showLibreMap={showLibreMap}
            libreMapRef={libreMapRef}
            leafletMapRef={leafletMapRef}
            isSuspendedRef={isSuspendedRef}
            configSelection={configSelection}
            responsiveState={responsiveState}
            gap={gap}
            windowSize={windowSize}
          />
        </div>
      )}
      <ControlLayoutCanvas>
        <div
          id="mapContainer"
          className={`h-dvh w-dvw flex flex-1 fixed overflow-hidden`}
          ref={wrapperRef}
          style={{
            marginTop: zenMode ? "0px" : "-56px",
          }}
        >
          {showLibreMap && isMode2d ? (
            <LibreGeoportalMap />
          ) : (
            <>
              <TopicMapComponentWrapper height={height} width={width} />
              {allow3d && <CesiumMapComponentWrapper />}
            </>
          )}
        </div>
      </ControlLayoutCanvas>
    </ControlLayout>
  );
};

export default GeoportalMap;
