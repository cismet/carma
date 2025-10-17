import { useControls, button } from "leva";
import { useCesiumContext } from "../../hooks/useCesiumContext";
import { useHomeControl } from "../../hooks/useHomeControl";
import { CtxEvent } from "../../context/cesiumContextEventMap";
import { useEffect, useState } from "react";
import { cameraPositionCartographicDegrees } from "@carma-mapping/engines/cesium/api";

interface CesiumLevaControlsProps {
  onOpenEditor?: () => void;
}

export function CesiumLevaControls({
  onOpenEditor,
}: CesiumLevaControlsProps = {}) {
  const { config, emit, currentSceneStyleRef, sceneRef } = useCesiumContext();
  const flyHome = useHomeControl();

  const [currentStyle, setCurrentStyle] = useState(
    currentSceneStyleRef.current
  );
  const [cameraPos, setCameraPos] = useState({
    x: 0,
    y: 0,
    z: 0,
    lat: 0,
    lng: 0,
    alt: 0,
  });

  // Get available scene styles
  const sceneStyles = config.sceneStyles || [];
  const styleOptions = sceneStyles.reduce(
    (acc: Record<string, string>, style: any) => {
      acc[style.name] = style.id;
      return acc;
    },
    {} as Record<string, string>
  );

  // Subscribe to scene style changes
  useEffect(() => {
    const unsubscribe =
      emit && config.sceneStyles && typeof emit === "function"
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
  }, [emit, currentSceneStyleRef, currentStyle, config.sceneStyles]);

  // Subscribe to camera changes for debug UI
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene?.camera) return;

    const updateCameraPosition = () => {
      if (!scene.camera) return;

      const pos = scene.camera.position;
      const degPos = cameraPositionCartographicDegrees(scene.camera);

      setCameraPos({
        x: pos.x,
        y: pos.y,
        z: pos.z,
        lat: degPos.latitude,
        lng: degPos.longitude,
        alt: degPos.altitude,
      });
    };

    updateCameraPosition();
    scene.camera.changed.addEventListener(updateCameraPosition);

    return () => {
      if (scene?.camera) {
        scene.camera.changed.removeEventListener(updateCameraPosition);
      }
    };
  }, [sceneRef]);

  const cameraDebugText = `Cartesian3:
  x: ${cameraPos.x.toFixed(2)}
  y: ${cameraPos.y.toFixed(2)}
  z: ${cameraPos.z.toFixed(2)}
Cartographic:
  lat: ${cameraPos.lat.toFixed(6)}°
  lng: ${cameraPos.lng.toFixed(6)}°
  alt: ${cameraPos.alt.toFixed(2)} m`;

  const controls: Record<string, any> = {
    "Scene Style": {
      value: currentStyle,
      options: styleOptions,
      onChange: (value: string) => {
        emit(CtxEvent.SetSceneStyle, value);
        setCurrentStyle(value);
      },
    },
    "Fly Home": button(() => flyHome()),
    "📹 Camera": {
      value: cameraDebugText,
      rows: 8,
      editable: false,
    },
  };

  if (onOpenEditor) {
    controls["Edit Config"] = button(() => onOpenEditor());
  }

  useControls("Cesium Controls", controls, [cameraPos]);

  return null;
}
