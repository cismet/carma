import { useEffect, useRef, useState, FC } from "react";
import {
  useCesium,
  BillboardCollection,
  BillboardGraphics,
  Entity,
  PolylineGraphics,
  Model,
} from "resium";
import {
  Cartesian3,
  Color,
  ColorMaterialProperty,
  ConstantProperty,
  Matrix4,
  Quaternion,
  Transforms,
  VerticalOrigin,
  Math as CesiumMath,
} from "cesium";
import { Marker3dData, MarkerData } from "../..";

interface MarkerContainerProps {
  debug?: boolean;
  allow3d?: boolean;
  style?: unknown;
  markerData: MarkerData[];
}

const DEFAULT_MARKER3D_ROTATION_SPEED = 0.001;

export const MarkerContainer: FC<MarkerContainerProps> = ({
  debug = false,
  allow3d = true,
  style,
  markerData,
}) => {
  const { viewer } = useCesium();
  const [entityData, setEntityData] = useState<Marker3dData[] | null>(null);
  const lastFrameTimeRef = useRef<number | null>(null);
  const [animatonSpeed, setAnimationSpeed] = useState<number>(
    DEFAULT_MARKER3D_ROTATION_SPEED,
  );

  useEffect(() => {
    setEntityData(
      markerData.map((data, i) => {
        const {
          position: [x, y, z],
          model,
        } = data;

        const position = Cartesian3.fromDegrees(x, y, z);
        const scale = model?.scale || 1;
        const offset = model?.anchorOffset || { x: 0, y: 0, z: 0 };
        const offsetZ = offset.z || 0;
        const modelMatrix = Transforms.eastNorthUpToFixedFrame(position);
        const translation = Matrix4.fromTranslation(
          new Cartesian3(0, 0, offsetZ * scale),
        );
        Matrix4.multiply(modelMatrix, translation, modelMatrix);
        // Update modelMatrix in entityDataRef
        (data as Marker3dData).modelMatrix = modelMatrix.clone();
        (data as Marker3dData).animatedModelMatrix = modelMatrix.clone();

        return data as Marker3dData;
      }),
    );
  }, [markerData]);

  /*
  useEffect(() => {
    if (viewer && entityData) {
      const preRenderListener = () => {
        entityData.forEach(({ model, animatedModelMatrix }, i) => {
          if (model?.hasAnimation && animatedModelMatrix) {
            const modelEntity = viewer.entities.getById(i.toString());
            if (modelEntity && modelEntity?.model) {
              const animations = modelEntity.model.activeAnimations;
              if (animations && animations.length === 0) {
                animations.addAll({
                  loop: ModelAnimationLoop.REPEAT,
                });
              }
            }
          }
        });
      };

      viewer.scene.preRender.addEventListener(preRenderListener);
      return () => {
        viewer.scene.preRender.removeEventListener(preRenderListener);
      };
    }
  }, [viewer, entityData]);
  */

  useEffect(() => {
    if (viewer && entityData && animatonSpeed !== 0) {
      const preRenderListener = () => {
        const currentTime = new Date().getTime();
        if (lastFrameTimeRef.current === null) {
          lastFrameTimeRef.current = currentTime;
        }
        const deltaTime = currentTime - lastFrameTimeRef.current;
        lastFrameTimeRef.current = currentTime;

        const updatedEntityData = entityData.map(
          ({ modelMatrix, animatedModelMatrix, model }, i) => {
            const { isCameraFacing, rotation } = model || {};
            if (model && modelMatrix && animatedModelMatrix) {
              let scale;
              if (model.fixedScale) {
                const dist = Cartesian3.distance(
                  viewer.camera.position,
                  new Cartesian3(
                    modelMatrix[12],
                    modelMatrix[13],
                    modelMatrix[14],
                  ),
                );
                if (dist) {
                  // TODO fix scaling origin
                  scale = new Cartesian3(dist / 1000, dist / 1000, dist / 1000);
                }
                //scale = new Cartesian3(1, 1, 1);
              } else {
                scale = new Cartesian3(1, 1, 1);
              }

              if (rotation) {
                const RotationQuaternion = Quaternion.fromAxisAngle(
                  Cartesian3.UNIT_Z,
                  (rotation === true ? 1 : rotation) *
                    animatonSpeed *
                    deltaTime,
                );

                const rotationMatrix =
                  Matrix4.fromTranslationQuaternionRotationScale(
                    new Cartesian3(0, 0, 0),
                    RotationQuaternion,
                    scale,
                  );
                const updatedModelMatrix = Matrix4.clone(animatedModelMatrix);
                Matrix4.multiply(
                  updatedModelMatrix,
                  rotationMatrix,
                  updatedModelMatrix,
                );
                return {
                  ...entityData[i],
                  animatedModelMatrix: updatedModelMatrix,
                }; // Update modelMatrix
              } else if (isCameraFacing) {
                const cameraHeading = viewer.camera.heading;
                const rotationQuaternion = Quaternion.fromAxisAngle(
                  Cartesian3.UNIT_Z,
                  -cameraHeading - CesiumMath.PI_OVER_TWO,
                );
                const rotationMatrix =
                  Matrix4.fromTranslationQuaternionRotationScale(
                    new Cartesian3(0, 0, 0),
                    rotationQuaternion,
                    scale,
                  );
                const updatedModelMatrix = Matrix4.clone(modelMatrix);
                Matrix4.multiply(
                  updatedModelMatrix,
                  rotationMatrix,
                  updatedModelMatrix,
                );
                return {
                  ...entityData[i],
                  animatedModelMatrix: updatedModelMatrix,
                }; // Update modelMatrix
              }
            }
            return entityData[i];
          },
        );

        setEntityData(updatedEntityData);
      };

      viewer.scene.preRender.addEventListener(preRenderListener);
      return () => {
        viewer.scene.preRender.removeEventListener(preRenderListener);
      };
    }
    return;
  }, [viewer, entityData, animatonSpeed]);

  // Use modelMatrix from entityDataRef in Model component
  const entities =
    entityData &&
    markerData.map(({ position: [x, y, z = 0], model, image, scale }, i) => {
      const position = Cartesian3.fromDegrees(x, y, z);
      const lineTopPosition = Cartesian3.fromDegrees(x, y, z - 10);
      const groundPosition = Cartesian3.fromDegrees(x, y, 0);
      return (
        <Entity key={i} position={position}>
          {allow3d && model
            ? entityData[i] && (
                <Model
                  url={model.uri}
                  scale={model.scale}
                  modelMatrix={entityData[i].animatedModelMatrix}
                  //clampAnimations={false}
                />
              )
            : image && (
                <>
                  <BillboardGraphics
                    image={image}
                    scale={scale}
                    verticalOrigin={VerticalOrigin.BOTTOM}
                  />
                  <PolylineGraphics
                    width={4}
                    positions={
                      new ConstantProperty([lineTopPosition, groundPosition])
                    }
                    material={new ColorMaterialProperty(Color.YELLOW)}
                  />
                </>
              )}
        </Entity>
      );
    });

  return <BillboardCollection>{entities}</BillboardCollection>;
};

export default MarkerContainer;
