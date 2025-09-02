import { type RefObject, useEffect, useCallback } from "react";
import {
  Viewer,
  Cartesian3,
  Math as CesiumMath,
  OrthographicFrustum,
  PerspectiveFrustum,
  HeadingPitchRoll,
  Transforms,
  ConstantPositionProperty,
  ConstantProperty,
  Entity,
  DebugModelMatrixPrimitive,
  Cesium3DTileset,
  CustomShader,
  LightingModel,
} from "cesium";
import { useControls, button, Leva } from "leva";
import { type ModelConfig } from "@carma-commons/resources";
import { CUSTOM_SHADERS_DEFINITIONS } from "@carma-mapping/engines/cesium";

interface ModelPlacementUIProps {
  viewerRef: RefObject<Viewer | null>;
  modelEntityRef: RefObject<Entity | null>;
  debugPrimitiveRef: RefObject<DebugModelMatrixPrimitive | null>;
  modelConfig: ModelConfig;
  tilesetRef: RefObject<Cesium3DTileset | null>;
}
// Create shader options from imported definitions
const shaderOptions = Object.keys(CUSTOM_SHADERS_DEFINITIONS);

// Define PBR shaders that don't support fog/saturation controls
const UNDEFINED_KEY = "UNDEFINED";
const PBR_SHADER_KEYS = [UNDEFINED_KEY, "CLAY"];

export const ModelPlacementUI = ({
  viewerRef,
  modelEntityRef,
  debugPrimitiveRef,
  modelConfig,
  tilesetRef,
}: ModelPlacementUIProps) => {
  // Get initial values from model config
  const baseLat = modelConfig.position.latitude;
  const baseLon = modelConfig.position.longitude;
  const baseHeading = modelConfig.orientation?.heading ?? 0;

  // Function to update model position and orientation
  const updateModelTransform = useCallback(
    (lat: number, lon: number, heading: number) => {
      const currentViewer = viewerRef.current;
      const modelEntity = modelEntityRef.current;
      const debugPrimitive = debugPrimitiveRef.current;

      if (currentViewer && modelEntity && debugPrimitive) {
        // Create new position from lat/long
        const newPosition = Cartesian3.fromDegrees(
          lon,
          lat,
          modelConfig.position.altitude
        );

        // Update model position
        modelEntity.position = new ConstantPositionProperty(newPosition);

        // Create orientation from heading only (pitch=0, roll=0)
        const hpr = new HeadingPitchRoll(
          CesiumMath.toRadians(heading),
          0, // pitch
          0 // roll
        );

        // Update model orientation
        modelEntity.orientation = new ConstantProperty(
          Transforms.headingPitchRollQuaternion(newPosition, hpr)
        );

        // Update debug primitive matrix
        const modelMatrix = Transforms.headingPitchRollToFixedFrame(
          newPosition,
          hpr
        );
        debugPrimitive.modelMatrix = modelMatrix;
        viewerRef.current.scene.requestRender();
      }
    },
    [
      modelConfig.position.altitude,
      viewerRef,
      modelEntityRef,
      debugPrimitiveRef,
    ]
  );

  // Model position offset controls
  const { latOffset, lonOffset, heading } = useControls("Position Offsets", {
    latOffset: {
      value: 0,
      min: -500,
      max: 500,
      step: 1, // Steps of 1 microdegree
      label: "Lat Offset (μ°)",
    },
    lonOffset: {
      value: 0,
      min: -500,
      max: 500,
      step: 1, // Steps of 1 microdegree
      label: "Lon Offset (μ°)",
    },
    heading: {
      value: baseHeading,
      min: 0.0,
      max: 360.0,
      step: 0.01,
      label: "Heading (°)",
    },
  });

  // Calculate final coordinates
  const finalLat = baseLat + latOffset * 0.000001;
  const finalLon = baseLon + lonOffset * 0.000001;

  // Final position info text
  useControls("Position Info", {
    "Current Position": {
      value: `${finalLat.toFixed(6)}, ${finalLon.toFixed(6)}`,
      disabled: true,
    },
    Heading: {
      value: `${heading.toFixed(2)}°`,
      disabled: true,
    },
    "Debug Axes": {
      value: false,
      onChange: (value: boolean) => {
        const debugPrimitive = debugPrimitiveRef.current;
        if (debugPrimitive) {
          debugPrimitive.show = value;
        }
        viewerRef.current?.scene.requestRender();
      },
    },
  });

  // Camera controls
  useControls("Camera", {
    orthographic: {
      value: false,
      onChange: (value: boolean) => {
        const currentViewer = viewerRef.current;
        if (currentViewer) {
          if (value) {
            const canvas = currentViewer.scene.canvas;
            const width = canvas.clientWidth;
            const height = canvas.clientHeight;
            const aspectRatio = width / height;

            const orthoFrustum = new OrthographicFrustum();
            orthoFrustum.aspectRatio = aspectRatio;
            orthoFrustum.width = 2000;

            currentViewer.scene.camera.frustum = orthoFrustum;
          } else {
            const perspFrustum = new PerspectiveFrustum();
            perspFrustum.fov = CesiumMath.toRadians(60);
            perspFrustum.aspectRatio =
              currentViewer.scene.canvas.clientWidth /
              currentViewer.scene.canvas.clientHeight;
            currentViewer.scene.camera.frustum = perspFrustum;
          }
        }
      },
    },
    fov: {
      value: 60, // Default FOV in degrees
      min: 1,
      max: 80,
      step: 1,
      onChange: (value: number) => {
        const currentViewer = viewerRef.current;
        if (
          currentViewer &&
          currentViewer.scene.camera.frustum instanceof PerspectiveFrustum
        ) {
          currentViewer.scene.camera.frustum.fov = CesiumMath.toRadians(value);
        }
      },
    },
    "Top-Down": button(() => {
      const currentViewer = viewerRef.current;
      if (currentViewer) {
        const viewPosition = Cartesian3.fromDegrees(
          modelConfig.position.longitude - 0.0007,
          modelConfig.position.latitude - 0.0037,
          modelConfig.position.altitude + 3000
        );
        currentViewer.camera.setView({
          destination: viewPosition,
          orientation: {
            heading: 0.0,
            pitch: CesiumMath.toRadians(-90),
            roll: 0.0,
          },
        });
      }
    }),
  });

  // Tileset quality control
  useControls("Tileset", {
    maxScreenSpaceError: {
      value: 1.0,
      min: 0.1,
      max: 16.0,
      step: 0.1,
      label: "Max Screen Space Error",
      onChange: (value: number) => {
        const tileset = tilesetRef.current;
        if (tileset) {
          tileset.maximumScreenSpaceError = value;
        }
      },
    },
    shader: {
      label: "Shader",
      value: "UNLIT_ENHANCED_2024",
      options: shaderOptions,
      onChange: (value: string) => {
        const tileset = tilesetRef.current;
        if (tileset) {
          const shaderDef =
            CUSTOM_SHADERS_DEFINITIONS[
              value as keyof typeof CUSTOM_SHADERS_DEFINITIONS
            ];
          if (value === UNDEFINED_KEY) {
            tileset.customShader = undefined;
          } else {
            tileset.customShader = new CustomShader(shaderDef);
          }
        }
      },
    },
    fogIntensity: {
      value: 0.0,
      min: 0.0,
      max: 100.0,
      step: 0.1,
      label: "Fog Intensity",
      render: (get) => {
        const selectedShader = get("Tileset Quality.shader");
        // Show for all UNLIT shaders, hide for UNDEFINED and CLAY (PBR)
        return !PBR_SHADER_KEYS.includes(selectedShader);
      },
      onChange: (value: number) => {
        const tileset = tilesetRef.current;
        if (tileset && tileset.customShader) {
          try {
            // Convert linear slider (0-100) to exponential fog intensity
            const fogIntensity =
              value === 0 ? 0 : Math.pow(10, (value - 100) / 20);
            tileset.customShader.setUniform("u_fogIntensity", fogIntensity);
          } catch (error) {
            console.warn("Failed to set fog intensity uniform:", error);
          }
        }
      },
    },
    maxFog: {
      value: 1.0,
      min: 0.0,
      max: 1.0,
      step: 0.01,
      label: "Max Fog",
      render: (get) => {
        const selectedShader = get("Tileset Quality.shader");
        return !PBR_SHADER_KEYS.includes(selectedShader);
      },
      onChange: (value: number) => {
        const tileset = tilesetRef.current;
        if (tileset && tileset.customShader) {
          try {
            tileset.customShader.setUniform("u_maxFog", value);
          } catch (error) {
            console.warn("Failed to set max fog uniform:", error);
          }
        }
      },
    },
    saturation: {
      value: 1.0,
      min: 0.0,
      max: 2.0,
      step: 0.01,
      label: "Saturation",
      render: (get) => {
        const selectedShader = get("Tileset Quality.shader");
        return !PBR_SHADER_KEYS.includes(selectedShader);
      },
      onChange: (value: number) => {
        const tileset = tilesetRef.current;
        if (tileset && tileset.customShader) {
          try {
            tileset.customShader.setUniform("u_saturation", value);
          } catch (error) {
            console.warn("Failed to set saturation uniform:", error);
          }
        }
      },
    },
  });

  // Update model when values change
  useEffect(() => {
    updateModelTransform(finalLat, finalLon, heading);
  }, [finalLat, finalLon, heading, updateModelTransform]);

  return (
    <>
      <Leva collapsed />
    </>
  );
};
