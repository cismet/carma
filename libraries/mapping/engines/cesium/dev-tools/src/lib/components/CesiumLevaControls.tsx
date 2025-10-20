import { useControls, button } from "leva";
import {
  useCesiumContext,
  useHomeControl,
  useZoomControls,
  CtxEvent,
} from "@carma-mapping/engines/cesium/core";
import { useEffect, useState } from "react";
import { horizontalButtonRow } from "./horizontal-button-row-plugin";
import { cameraPosition } from "./camera-position-plugin";

interface CesiumLevaControlsProps {
  onOpenEditor?: () => void;
}

/**
 * Reusable Leva controls for Cesium debugging
 * Used in storybook and development
 */
export function CesiumLevaControls({
  onOpenEditor,
}: CesiumLevaControlsProps = {}) {
  const { config, emit, currentSceneStyleRef, sceneRef } = useCesiumContext();
  const flyHome = useHomeControl();
  const { handleZoomIn, handleZoomOut } = useZoomControls({ fovMode: false });
  const { handleZoomIn: handleFovZoomIn, handleZoomOut: handleFovZoomOut } =
    useZoomControls({ fovMode: true });

  // Create mock event for Leva button handlers
  const createMockEvent = () =>
    ({
      preventDefault: () => {},
      stopPropagation: () => {},
      currentTarget: {},
      target: {},
    } as React.MouseEvent);

  const [currentStyle, setCurrentStyle] = useState(
    currentSceneStyleRef.current
  );
  const [cameraRef, setCameraRef] = useState(sceneRef.current?.camera || null);

  // Update camera ref when scene changes
  useEffect(() => {
    const camera = sceneRef.current?.camera;
    if (camera && camera !== cameraRef) {
      setCameraRef(camera);
    }
  }, [sceneRef.current?.camera, cameraRef]);

  // Get available style variants from sceneStyle.styles
  const styles = config.sceneStyle?.styles || [];
  const styleOptions = styles.reduce(
    (acc: Record<string, string>, style: any) => {
      acc[style.name || style.id] = style.id;
      return acc;
    },
    {} as Record<string, string>
  );

  // Subscribe to scene style changes
  useEffect(() => {
    const unsubscribe =
      emit && config.sceneStyle && typeof emit === "function"
        ? () => {}
        : () => {};

    // Update when style changes
    const interval = setInterval(() => {
      if (currentSceneStyleRef.current !== currentStyle) {
        setCurrentStyle(currentSceneStyleRef.current);
      }
    }, 100);

    return () => {
      clearInterval(interval);
      if (typeof unsubscribe === "function") unsubscribe();
    };
  }, [emit, currentSceneStyleRef, currentStyle, config.sceneStyle]);

  // Camera position is now handled by the cameraPosition plugin

  // Build camera controls dynamically to handle null camera
  const cameraControls: Record<string, any> = {
    Controls: horizontalButtonRow({
      HOME: () => flyHome(),
      "+": () => handleZoomIn(createMockEvent()),
      "-": () => handleZoomOut(createMockEvent()),
      "FOV+": () => handleFovZoomIn(createMockEvent()),
      "FOV-": () => handleFovZoomOut(createMockEvent()),
    }),
  };

  // Only add position plugin if camera is available
  if (cameraRef) {
    cameraControls.Position = cameraPosition({
      camera: cameraRef,
      showECEF: false,
    });
  }

  useControls("Camera", cameraControls, [cameraRef]);

  const sceneControls: Record<string, any> = {
    "Scene Style": {
      value: currentStyle,
      options: styleOptions,
      onChange: (value: string) => {
        emit(CtxEvent.SetSceneStyle, value);
        setCurrentStyle(value);
      },
    },
  };

  if (onOpenEditor) {
    sceneControls["Edit Config"] = button(() => onOpenEditor());
  }

  useControls("Scene", sceneControls, [currentStyle]);

  return null;
}
