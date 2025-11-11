import type { Meta, StoryObj } from "@storybook/react";
import { useEffect, useState } from "react";
import {
  MapFrameworkSwitcher,
  MapFrameworkSwitcherProvider,
  useRegisterMapFramework,
} from "@carma-mapping/components";
import { useLeafletCesiumSetup } from "./hooks/useLeafletCesiumSetup";
import { ElevationDisplay } from "./components/ElevationDisplay";
import { FovControl } from "./components/FovControl";
import { ActiveFrameworkIndicator } from "./components/ActiveFrameworkIndicator";
import { MapContainers } from "./components/MapContainers";
import { ResolutionStatus } from "./components/ResolutionStatus";
import { styles } from "./helpers/styles";
import { RESOLUTION_SCALE } from "./helpers/constants";

import "leaflet/dist/leaflet.css";
import "cesium/Build/Cesium/Widgets/widgets.css";

if (typeof window !== "undefined") {
  (window as any).CESIUM_BASE_URL = "/__cesium__/";
}

const LeafletToCesium = () => {
  const {
    leafletContainerRef,
    cesiumContainerRef,
    leafletMapRef,
    cesiumWidgetRef,
    terrainProvidersRef,
    mapsInitialized,
  } = useLeafletCesiumSetup();

  useRegisterMapFramework({
    leafletMap: mapsInitialized ? leafletMapRef.current : null,
    cesiumScene: mapsInitialized
      ? cesiumWidgetRef.current?.scene ?? null
      : null,
    cesiumContainer: cesiumContainerRef.current,
    terrainProviders: terrainProvidersRef.current,
  });

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

const CesiumToLeaflet = () => {
  const {
    leafletContainerRef,
    cesiumContainerRef,
    leafletMapRef,
    cesiumWidgetRef,
    terrainProvidersRef,
    mapsInitialized,
  } = useLeafletCesiumSetup();

  useRegisterMapFramework({
    leafletMap: mapsInitialized ? leafletMapRef.current : null,
    cesiumScene: mapsInitialized
      ? cesiumWidgetRef.current?.scene ?? null
      : null,
    cesiumContainer: cesiumContainerRef.current,
    terrainProviders: terrainProvidersRef.current,
  });

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

const FullFeatured = () => {
  const {
    leafletContainerRef,
    cesiumContainerRef,
    leafletMapRef,
    cesiumWidgetRef,
    terrainProvidersRef,
    mapsInitialized,
  } = useLeafletCesiumSetup();

  useRegisterMapFramework({
    leafletMap: mapsInitialized ? leafletMapRef.current : null,
    cesiumScene: mapsInitialized
      ? cesiumWidgetRef.current?.scene ?? null
      : null,
    cesiumContainer: cesiumContainerRef.current,
    terrainProviders: terrainProvidersRef.current,
  });

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

const meta: Meta = {
  title: "MapFrameworkSwitcher/Switching with Context",
  parameters: {
    layout: "fullscreen",
  },
};

export default meta;

export const LeafletCesium: StoryObj<typeof LeafletToCesium> = {
  render: () => (
    <MapFrameworkSwitcherProvider initialFramework="leaflet">
      <LeafletToCesium />
    </MapFrameworkSwitcherProvider>
  ),
};

export const CesiumLeaflet: StoryObj<typeof CesiumToLeaflet> = {
  render: () => (
    <MapFrameworkSwitcherProvider initialFramework="cesium">
      <CesiumToLeaflet />
    </MapFrameworkSwitcherProvider>
  ),
};
const ResolutionScaleTest = ({
  resolutionScale = 1.0,
  useBrowserRecommendedResolution = false,
}: {
  resolutionScale?: number;
  useBrowserRecommendedResolution?: boolean;
}) => {
  const {
    leafletContainerRef,
    cesiumContainerRef,
    leafletMapRef,
    cesiumWidgetRef,
    terrainProvidersRef,
    mapsInitialized,
  } = useLeafletCesiumSetup({
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

  useRegisterMapFramework({
    leafletMap: mapsInitialized ? leafletMapRef.current : null,
    cesiumScene: mapsInitialized
      ? cesiumWidgetRef.current?.scene ?? null
      : null,
    cesiumContainer: cesiumContainerRef.current,
    terrainProviders: terrainProvidersRef.current,
  });

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

export const ResolutionScale: StoryObj<typeof ResolutionScaleTest> = {
  args: {
    resolutionScale: 1.0,
    useBrowserRecommendedResolution: false,
  },
  argTypes: {
    resolutionScale: {
      control: {
        type: "inline-radio",
        labels: RESOLUTION_SCALE.labels,
      },
      options: RESOLUTION_SCALE.options,
      description: "Cesium render resolution scale",
      table: {
        type: { summary: "number" },
        defaultValue: { summary: "1.0" },
      },
    },
    useBrowserRecommendedResolution: {
      control: "boolean",
      description: "Use browser recommended resolution (ignores DPR)",
      table: {
        type: { summary: "boolean" },
        defaultValue: { summary: "false" },
      },
    },
  },
  render: (args) => (
    <MapFrameworkSwitcherProvider initialFramework="cesium">
      <ResolutionScaleTest {...args} />
    </MapFrameworkSwitcherProvider>
  ),
};

export const Debugging: StoryObj<typeof FullFeatured> = {
  render: () => (
    <MapFrameworkSwitcherProvider initialFramework="leaflet">
      <FullFeatured />
    </MapFrameworkSwitcherProvider>
  ),
};
