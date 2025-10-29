import { useContext, useEffect, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";

import { Tooltip } from "antd";

import { faEyeSlash } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { ResponsiveTopicMapContext } from "react-cismap/contexts/ResponsiveTopicMapContextProvider";

import {
  CesiumMapComponentWrapper,
  usePortalContext,
} from "@carma-appframeworks/portals";
import { detectWebGLContext } from "@carma-commons/dom/canvas";

import { useCarmaTopicMapContext } from "@carma-mapping/engines/carma-cismap";
// useCesiumContext removed - geoportal should only interact with Cesium through PortalContext

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

import { useDispatchSachdatenInfoText } from "../../hooks/useDispatchSachdatenInfoText.ts";
import { useFeatureInfoModeCursorStyle } from "../../hooks/useFeatureInfoModeCursorStyle.ts";
import { useWindowSize } from "../../hooks/useWindowSize.ts";

import { getConfigSelection } from "../../store/slices/mapping.ts";
// getLibreMapRef removed - using local ref instead
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
  // isSuspendedRef removed - suspension is now managed by PortalContext
  const { leafletMapRef } = useCarmaTopicMapContext();

  const showLibreMap = flags.featureFlagLibreMap;

  const wrapperRef = useRef<HTMLDivElement>(null);
  // Local ref for LibreMap - not stored in Redux
  const libreMapRef = useRef<any>(null); // Type: MaplibreMap | null

  // State and Selectors
  const allow3d = useSelector(getUIAllow3d) && hasGPU;

  // Get map mode from PortalProvider context
  const { isCesiumActive } = usePortalContext();
  const isMode2d = !isCesiumActive();
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

  const { width, height } = useWindowSize(wrapperRef);

  useFeatureInfoModeCursorStyle();

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
          <GeoportalControls />
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
              {allow3d && <CesiumMapComponentWrapper key="cesium-3d" />}
            </>
          )}
        </div>
      </ControlLayoutCanvas>
    </ControlLayout>
  );
};

export default GeoportalMap;
