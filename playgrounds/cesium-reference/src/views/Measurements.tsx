import React, { useState, useRef } from "react";
import { Flex } from "antd";

import { WUPP_MESH_2024 } from "@carma-commons/resources";
import { CesiumErrorToErrorBoundaryForwarder } from "@carma-mapping/cesium-engine";

import {
  CesiumViewerProvider,
  useCesiumViewer,
} from "../contexts/CesiumViewerContext";
import { CesiumMeasurementsProvider } from "../measurements/CesiumMeasurementsContext";
import ScreenLayout from "../components/ScreenLayout";
import MeasurementPanel from "../measurements/components/MeasurementPanel";
import { InteractiveModeTabs } from "../measurements/components/InteractiveModeTabs";

import { cesiumConstructorOptions } from "../config";
import { NivPointControls } from "../measurements/components/NivPointControls";
import { NivPointPanel } from "../measurements/components/NivPointPanel";

import HomeButton from "../components/HomeButton";
import { CesiumNivPointProvider } from "../measurements/CesiumNivPointContext";

// Inner component that has access to contexts
const ContextAwareApp: React.FC<{}> = () => {
  const { zoomToTileset } = useCesiumViewer();

  const TopRightPanel: React.FC = () => {
    return (
      <Flex vertical gap={2} style={{ maxWidth: "24rem" }}>
        <InteractiveModeTabs />
        <MeasurementPanel />
      </Flex>
    );
  };

  return (
    <>
      <ScreenLayout
        topLeft={
          <Flex vertical gap={2} style={{ maxWidth: "24rem" }}>
            <NivPointControls />
            <NivPointPanel />
          </Flex>
        }
        topRight={<TopRightPanel />}
        bottomCenter={<HomeButton onHomeClick={zoomToTileset} />}
      />
    </>
  );
};

const TestMeshElevations: React.FC = () => {
  const containerRef = useRef<HTMLDivElement | null>(null);

  return (
    <>
      <CesiumErrorToErrorBoundaryForwarder />
      <div
        ref={containerRef}
        style={{
          width: "100%",
          height: "100vh",
        }}
      />
      <CesiumViewerProvider
        containerRef={containerRef}
        options={{
          cesiumOptions: cesiumConstructorOptions,
          tilesetUrl: WUPP_MESH_2024.url,
          tilesetOptions: {
            skipLevelOfDetail: true,
            immediatelyLoadDesiredLevelOfDetail: true,
            maximumScreenSpaceError: 1,
            show: true,
          },
          cameraPersistence: {
            autoSave: true,
            saveDelay: 1000,
            autoRestore: true,
          },
        }}
      >
        <CesiumMeasurementsProvider>
          <CesiumNivPointProvider>
            <ContextAwareApp />
          </CesiumNivPointProvider>
        </CesiumMeasurementsProvider>
      </CesiumViewerProvider>
    </>
  );
};

export default TestMeshElevations;
