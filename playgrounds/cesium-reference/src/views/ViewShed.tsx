import { useEffect, useRef, useState } from "react";
import { Button, Checkbox } from "antd";
import { Cartesian3, Cartographic, Color, Entity, Viewer } from "cesium";
import { WUPP_MESH_2024 } from "@carma-commons/resources";
import SensorShadow from "../lib/SensorShadow/src/SensorShadow";
import { toCartographic } from "../lib/cesiumUtils";
import useTileset from "../hooks/useTileset";

import { cesiumConstructorOptions } from "../config";
import { TOELLETURM_CAMERA, TOELLETURM_TARGET } from "../config.poi";

const sensorConfig = {
  cameraPositionCartographic: toCartographic(TOELLETURM_CAMERA),
  targetPositionCartographic: toCartographic(TOELLETURM_TARGET),
};

const ViewShed: React.FC = () => {
  const constainerRef = useRef<HTMLDivElement | null>(null);
  const viewerRef = useRef<Viewer | null>(null);
  const { tilesetRef, tilesetReady } = useTileset(
    WUPP_MESH_2024.url,
    viewerRef
  );

  const targetPointRef = useRef<Entity | null>(null);
  const cameraPointRef = useRef<Entity | null>(null);

  useEffect(() => {
    const initialize = async () => {
      try {
        if (constainerRef.current) {
          const viewer = new Viewer(
            constainerRef.current,
            cesiumConstructorOptions
          );
          viewerRef.current = viewer;

          targetPointRef.current = viewer.entities.add({
            position: Cartographic.toCartesian(
              toCartographic(TOELLETURM_TARGET)
            ),
            point: {
              pixelSize: 10,
              color: Color.LIME,
            },
          });
          cameraPointRef.current = viewer.entities.add({
            position: Cartographic.toCartesian(
              toCartographic(TOELLETURM_CAMERA)
            ),
            point: {
              pixelSize: 10,
              color: Color.YELLOW,
            },
          });

          viewer.zoomTo([cameraPointRef.current, targetPointRef.current]);
        }
      } catch (error) {
        console.error("Initialization error:", error);
      }
    };

    initialize();

    return () => {
      if (viewerRef.current) {
        viewerRef.current.destroy();
      }
    };
  }, []);

  useEffect(() => {
    if (viewerRef.current.scene && tilesetReady) {
      let sensorShadow = new SensorShadow(viewerRef.current, {
        cameraPosition: Cartographic.toCartesian(
          sensorConfig.cameraPositionCartographic
        ),
        viewPosition: Cartographic.toCartesian(
          sensorConfig.targetPositionCartographic
        ),
        viewAreaColor: new Color(0.5, 1, 0.5),
        shadowAreaColor: new Color(0.2, 0.2, 0.2),
        alpha: 0.5,
        frustum: true,
        size: 1024,
      });
      viewerRef.current.scene.requestRender();
    }
  }, [tilesetReady]);

  const handleClickPOV = () => {
    if (viewerRef.current && cameraPointRef.current && targetPointRef.current) {
      const cameraPosition = cameraPointRef.current.position.getValue(
        viewerRef.current.clock.currentTime
      );
      const targetPosition = targetPointRef.current.position.getValue(
        viewerRef.current.clock.currentTime
      );

      const direction = Cartesian3.normalize(
        Cartesian3.subtract(targetPosition, cameraPosition, new Cartesian3()),
        new Cartesian3()
      );

      viewerRef.current.camera.flyTo({
        destination: cameraPosition,
        orientation: {
          direction: direction,
          up: Cartesian3.UNIT_Z,
        },
      });
    }
  };

  const handleClickOverview = () => {
    viewerRef.current &&
      viewerRef.current.zoomTo([
        cameraPointRef.current,
        targetPointRef.current,
      ]);
  };

  return (
    <>
      <div ref={constainerRef} style={{ width: "100%", height: "100vh" }} />;
      <div
        style={{
          position: "absolute",
          bottom: 10,
          right: 10,
          left: 10,
          padding: "10px",
          background: "rgba(255, 255, 255, 0.85)",
        }}
      >
        <Button onClick={handleClickOverview}>go to Overview </Button>
        <Button onClick={handleClickPOV}>view from Camera </Button>
      </div>
    </>
  );
};

export default ViewShed;
