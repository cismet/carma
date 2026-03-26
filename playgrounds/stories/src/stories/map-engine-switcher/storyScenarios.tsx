import { useEffect, type CSSProperties, type ReactNode } from "react";
import { useCallback } from "react";
import {
  CarmaResponsiveInfoBox,
  ResponsiveStatusBar,
} from "@carma-commons/ui/components";
import {
  CARMA_MAP_FRAMEWORKS,
  MapFrameworkSwitcher,
  MapFrameworkSwitcherProvider,
  useMapFrameworkSwitcherContext,
  useRegisterMapFramework,
  type CarmaMapFramework,
} from "@carma-mapping/components";
import { ElevationDisplay } from "./components/ElevationDisplay";
import { FovControl } from "./components/FovControl";
import { MapContainers } from "./components/MapContainers";
import { ResolutionStatus } from "./components/ResolutionStatus";
import { RESOLUTION_SCALE } from "./helpers/constants";
import { styles } from "./helpers/styles";
import { useLeafletCesiumSetup } from "./hooks/useLeafletCesiumSetup";
import { requestStoryCesiumRender } from "../shared/cesiumRuntimeGuards";

import "leaflet/dist/leaflet.css";
import "cesium/Build/Cesium/Widgets/widgets.css";

type StoryMappingEngine = CarmaMapFramework;

export type ResolutionScaleControls = {
  resolutionScale?: (typeof RESOLUTION_SCALE.options)[number];
  useBrowserRecommendedResolution?: boolean;
};

const BOTTOM_STATUS_BAR_OVERLAY_STYLE: CSSProperties = {
  position: "absolute",
  left: 0,
  right: 0,
  bottom: 0,
  zIndex: 1800,
  pointerEvents: "none",
};

const MappingEngineStateStatusBar = () => {
  const {
    activeFramework: activeEngine,
    isTransitioning,
    isPreparingCesiumTransition,
    preparingCesiumMessage,
  } = useMapFrameworkSwitcherContext();

  const activeEngineText =
    typeof activeEngine === "string" && activeEngine.trim().length > 0
      ? activeEngine
      : "unknown";
  const transitionText = isTransitioning
    ? isPreparingCesiumTransition
      ? preparingCesiumMessage ?? "preparing cesium"
      : "running"
    : "idle";
  const statusText = `${activeEngineText} • engine transition ${transitionText}`;

  return (
    <div style={BOTTOM_STATUS_BAR_OVERLAY_STYLE}>
      <ResponsiveStatusBar
        text={
          <span
            style={{
              width: "100%",
              display: "block",
              textAlign: "center",
            }}
          >
            {statusText}
          </span>
        }
        tone="dark"
      />
    </div>
  );
};

const MappingEngineProvider = ({
  initialEngine,
  children,
}: {
  initialEngine: StoryMappingEngine;
  children: ReactNode;
}) => (
  <MapFrameworkSwitcherProvider initialFramework={initialEngine}>
    {children}
  </MapFrameworkSwitcherProvider>
);

const useRegisteredLeafletCesiumEngines = (
  setupOptions?: Parameters<typeof useLeafletCesiumSetup>[0]
) => {
  const { activeFramework: activeEngine, registerCallbacks } =
    useMapFrameworkSwitcherContext();
  const {
    leafletContainerRef,
    cesiumContainerRef,
    leafletMapRef,
    cesiumWidgetRef,
    terrainProvidersRef,
    isLeafletReady,
    mapsInitialized,
    ensureCesiumReady,
  } = useLeafletCesiumSetup(setupOptions);

  useEffect(() => {
    registerCallbacks({
      onEnsureCesiumReady: ensureCesiumReady,
    });
  }, [ensureCesiumReady, registerCallbacks]);

  useEffect(() => {
    if (activeEngine === CARMA_MAP_FRAMEWORKS.CESIUM) {
      void ensureCesiumReady();
    }
  }, [activeEngine, ensureCesiumReady]);

  const getLeafletMap = useCallback(
    () => (isLeafletReady ? leafletMapRef.current : null),
    [isLeafletReady, leafletMapRef]
  );
  const getCesiumScene = useCallback(
    () => (mapsInitialized ? cesiumWidgetRef.current?.scene ?? null : null),
    [cesiumWidgetRef, mapsInitialized]
  );
  const getCesiumContainer = useCallback(
    () => cesiumContainerRef.current,
    [cesiumContainerRef]
  );
  const getCesiumTerrainProviders = useCallback(
    () => terrainProvidersRef.current,
    [terrainProvidersRef]
  );

  useRegisterMapFramework({
    getLeafletMap,
    getCesiumScene,
    getCesiumContainer,
    getCesiumTerrainProviders,
  });

  return {
    leafletContainerRef,
    cesiumContainerRef,
    cesiumWidgetRef,
    mapsInitialized,
  };
};

const BasicSwitcherScene = () => {
  const { leafletContainerRef, cesiumContainerRef, mapsInitialized } =
    useRegisteredLeafletCesiumEngines();

  return (
    <MapContainers
      leafletContainerRef={leafletContainerRef}
      cesiumContainerRef={cesiumContainerRef}
    >
      <MapFrameworkSwitcher
        nativeTooltip={true}
        style={styles.topLeftAbsolute}
      />
      <MappingEngineStateStatusBar />
    </MapContainers>
  );
};

const DebugScene = () => {
  const {
    leafletContainerRef,
    cesiumContainerRef,
    cesiumWidgetRef,
    mapsInitialized,
  } = useRegisteredLeafletCesiumEngines();

  return (
    <MapContainers
      leafletContainerRef={leafletContainerRef}
      cesiumContainerRef={cesiumContainerRef}
    >
      <MapFrameworkSwitcher
        nativeTooltip={true}
        style={styles.topLeftAbsolute}
      />
      <CarmaResponsiveInfoBox
        useControlLayout={false}
        draggable
        dragGripPlacement="auto"
        collapsible
        heading={
          <div style={{ fontWeight: 600, color: "#ffffff", lineHeight: 1.25 }}>
            FOV + Pixel Resolution
          </div>
        }
        headingColor="rgba(15, 23, 42, 0.88)"
        content={
          <FovControl
            cesiumWidget={cesiumWidgetRef.current}
            style={{
              position: "static",
              top: "auto",
              right: "auto",
              zIndex: "auto",
            }}
          />
        }
        style={{
          position: "absolute",
          top: 16,
          right: 16,
          zIndex: 1100,
          width: "fit-content",
          maxWidth: "calc(100vw - 32px)",
        }}
      />
      <CarmaResponsiveInfoBox
        useControlLayout={false}
        draggable
        dragGripPlacement="auto"
        collapsible
        defaultCollapsed={true}
        heading={
          <div style={{ fontWeight: 600, color: "#ffffff", lineHeight: 1.25 }}>
            Resolution Status
          </div>
        }
        headingColor="rgba(15, 23, 42, 0.88)"
        content={
          <ResolutionStatus
            style={{
              position: "static",
            }}
          />
        }
        style={{
          position: "absolute",
          top: 16,
          right: 458,
          zIndex: 1100,
          width: "fit-content",
          maxWidth: "calc(100vw - 32px)",
        }}
      />
      <CarmaResponsiveInfoBox
        useControlLayout={false}
        draggable
        dragGripPlacement="auto"
        collapsible
        defaultCollapsed={true}
        heading={
          <div style={{ fontWeight: 600, color: "#ffffff", lineHeight: 1.25 }}>
            Elevation / Zoom Sync
          </div>
        }
        headingColor="rgba(15, 23, 42, 0.88)"
        content={
          <ElevationDisplay
            style={{
              position: "static",
              right: "auto",
              bottom: "auto",
              zIndex: "auto",
            }}
          />
        }
        style={{
          position: "absolute",
          top: 16,
          right: 834,
          zIndex: 1100,
          width: "fit-content",
          maxWidth: "calc(100vw - 32px)",
        }}
      />
      <MappingEngineStateStatusBar />
    </MapContainers>
  );
};

const ResolutionScaleScene = ({
  resolutionScale = 1.0,
  useBrowserRecommendedResolution = false,
}: ResolutionScaleControls) => {
  const {
    leafletContainerRef,
    cesiumContainerRef,
    cesiumWidgetRef,
    mapsInitialized,
  } = useRegisteredLeafletCesiumEngines({
    cesium: { useBrowserRecommendedResolution },
  });

  useEffect(() => {
    const widget = cesiumWidgetRef.current;
    if (widget && mapsInitialized) {
      widget.resolutionScale = resolutionScale;
      requestStoryCesiumRender(widget);
    }
  }, [resolutionScale, mapsInitialized, cesiumWidgetRef]);

  useEffect(() => {
    const widget = cesiumWidgetRef.current;
    if (widget && mapsInitialized) {
      widget.useBrowserRecommendedResolution = useBrowserRecommendedResolution;
      requestStoryCesiumRender(widget);
    }
  }, [useBrowserRecommendedResolution, mapsInitialized, cesiumWidgetRef]);

  return (
    <MapContainers
      leafletContainerRef={leafletContainerRef}
      cesiumContainerRef={cesiumContainerRef}
    >
      <MapFrameworkSwitcher
        nativeTooltip={true}
        style={styles.topLeftAbsolute}
      />
      <ResolutionStatus
        style={{
          position: "absolute",
          left: "50%",
          bottom: "48px",
          transform: "translateX(-50%)",
          zIndex: 1000,
        }}
        resolutionScale={resolutionScale}
        useBrowserRecommendedResolution={useBrowserRecommendedResolution}
      />
      <MappingEngineStateStatusBar />
    </MapContainers>
  );
};

export const LeafletCesiumStory = () => (
  <MappingEngineProvider initialEngine={CARMA_MAP_FRAMEWORKS.LEAFLET}>
    <BasicSwitcherScene />
  </MappingEngineProvider>
);

export const CesiumLeafletStory = () => (
  <MappingEngineProvider initialEngine={CARMA_MAP_FRAMEWORKS.CESIUM}>
    <BasicSwitcherScene />
  </MappingEngineProvider>
);

export const ResolutionScaleStory = (args: ResolutionScaleControls) => (
  <MappingEngineProvider initialEngine={CARMA_MAP_FRAMEWORKS.CESIUM}>
    <ResolutionScaleScene {...args} />
  </MappingEngineProvider>
);

export const DebuggingStory = () => (
  <MappingEngineProvider initialEngine={CARMA_MAP_FRAMEWORKS.LEAFLET}>
    <DebugScene />
  </MappingEngineProvider>
);
