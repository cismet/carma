import { useEffect, type ReactNode } from "react";
import {
  MapFrameworkSwitcher,
  MapFrameworkSwitcherProvider,
  useRegisterMapFramework,
} from "@carma-mapping/components";
import { ElevationDisplay } from "./components/ElevationDisplay";
import { ActiveFrameworkIndicator } from "./components/ActiveFrameworkIndicator";
import { FovControl } from "./components/FovControl";
import { MapContainers } from "./components/MapContainers";
import { ResolutionStatus } from "./components/ResolutionStatus";
import { RESOLUTION_SCALE } from "./helpers/constants";
import { styles } from "./helpers/styles";
import { useLeafletCesiumSetup } from "./hooks/useLeafletCesiumSetup";

import "leaflet/dist/leaflet.css";
import "cesium/Build/Cesium/Widgets/widgets.css";

if (typeof window !== "undefined") {
  (window as any).CESIUM_BASE_URL = "/__cesium__/";
}

type Framework = "leaflet" | "cesium";

export type ResolutionScaleControls = {
  resolutionScale?: (typeof RESOLUTION_SCALE.options)[number];
  useBrowserRecommendedResolution?: boolean;
};

const FrameProvider = ({
  initialFramework,
  children,
}: {
  initialFramework: Framework;
  children: ReactNode;
}) => (
  <MapFrameworkSwitcherProvider initialFramework={initialFramework}>
    {children}
  </MapFrameworkSwitcherProvider>
);

const useRegisteredLeafletCesium = (
  setupOptions?: Parameters<typeof useLeafletCesiumSetup>[0]
) => {
  const {
    leafletContainerRef,
    cesiumContainerRef,
    leafletMapRef,
    cesiumWidgetRef,
    terrainProvidersRef,
    mapsInitialized,
  } = useLeafletCesiumSetup(setupOptions);

  useRegisterMapFramework({
    leafletMap: mapsInitialized ? leafletMapRef.current : null,
    cesiumScene: mapsInitialized
      ? cesiumWidgetRef.current?.scene ?? null
      : null,
    cesiumContainer: cesiumContainerRef.current,
    terrainProviders: terrainProvidersRef.current,
  });

  return {
    leafletContainerRef,
    cesiumContainerRef,
    cesiumWidgetRef,
    mapsInitialized,
  };
};

const BasicSwitcherScene = () => {
  const { leafletContainerRef, cesiumContainerRef } =
    useRegisteredLeafletCesium();

  return (
    <MapContainers
      leafletContainerRef={leafletContainerRef}
      cesiumContainerRef={cesiumContainerRef}
    >
      <MapFrameworkSwitcher
        nativeTooltip={true}
        style={styles.topLeftAbsolute}
      />
      <ActiveFrameworkIndicator />
    </MapContainers>
  );
};

const DebugScene = () => {
  const { leafletContainerRef, cesiumContainerRef, cesiumWidgetRef } =
    useRegisteredLeafletCesium();

  return (
    <MapContainers
      leafletContainerRef={leafletContainerRef}
      cesiumContainerRef={cesiumContainerRef}
    >
      <MapFrameworkSwitcher
        nativeTooltip={true}
        style={styles.topLeftAbsolute}
      />
      <ActiveFrameworkIndicator />
      <FovControl cesiumWidget={cesiumWidgetRef.current} />
      <ResolutionStatus />
      <ElevationDisplay />
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
  } = useRegisteredLeafletCesium({
    cesium: { useBrowserRecommendedResolution },
  });

  useEffect(() => {
    const widget = cesiumWidgetRef.current;
    if (widget && mapsInitialized) {
      widget.resolutionScale = resolutionScale;
      widget.scene.requestRender();
    }
  }, [resolutionScale, mapsInitialized, cesiumWidgetRef]);

  useEffect(() => {
    const widget = cesiumWidgetRef.current;
    if (widget && mapsInitialized) {
      widget.useBrowserRecommendedResolution = useBrowserRecommendedResolution;
      widget.scene.requestRender();
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
      <ActiveFrameworkIndicator />
      <ResolutionStatus
        resolutionScale={resolutionScale}
        useBrowserRecommendedResolution={useBrowserRecommendedResolution}
      />
    </MapContainers>
  );
};

export const LeafletCesiumStory = () => (
  <FrameProvider initialFramework="leaflet">
    <BasicSwitcherScene />
  </FrameProvider>
);

export const CesiumLeafletStory = () => (
  <FrameProvider initialFramework="cesium">
    <BasicSwitcherScene />
  </FrameProvider>
);

export const ResolutionScaleStory = (args: ResolutionScaleControls) => (
  <FrameProvider initialFramework="cesium">
    <ResolutionScaleScene {...args} />
  </FrameProvider>
);

export const DebuggingStory = () => (
  <FrameProvider initialFramework="leaflet">
    <DebugScene />
  </FrameProvider>
);
