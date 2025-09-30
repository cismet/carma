import {
  Cartesian3,
  Matrix4,
  Transforms,
  Quaternion,
  Model,
  Cartographic,
  Math as CesiumMath,
  Material,
  Color,
  PolylineCollection,
} from "cesium";

import type { MarkerPrimitiveData, ModelAsset, PolylineConfig } from "../..";
import type { CesiumContextType } from "../CesiumContext";

const defaultOptions = {
  id: "selected3dmarker",
};

type CesiumCtx = CesiumContextType;

const createOrUpdateStemline = (
  ctx: CesiumCtx,
  markerData: MarkerPrimitiveData,
  [pos, groundPos]: Cartographic[],
  options: Partial<PolylineConfig> = {}
) => {
  const topHeight = pos.height - (options.gap ?? 0);
  const baseHeight = groundPos.height + (options.gap ?? 10);

  const posTop = pos.clone();
  posTop.height = topHeight;
  const posBase = groundPos.clone();
  posBase.height = baseHeight;

  const posCenter = pos.clone();
  posCenter.height = baseHeight + (topHeight - baseHeight) * 0.2;

  const baseColor =
    options.color?.length === 4 ? new Color(...options.color) : Color.WHITE;

  const colorMaterial = Material.fromType("Color", { color: baseColor });

  const material = options.glow
    ? Material.fromType("PolylineGlow", {
        color: baseColor,
        glowPower: 1.0,
        taperPower: 0.1,
      })
    : colorMaterial;

  let positions;

  ctx.withScene((scene) => {
    positions = scene.ellipsoid.cartographicArrayToCartesianArray([
      posTop,
      posCenter,
      posBase,
    ]);
  });
  const width = options.width ?? 4;

  if (markerData.stemline) {
    markerData.stemline.positions = positions;
    markerData.stemline.width = width;
    markerData.stemline.material = material;
  } else {
    const [top, center, base] = positions;
    const polylineTop = {
      positions: [top, center],
      width,
      material,
    };
    const polylineBottom = {
      positions: [base, center],
      width,
      material,
    };
    console.debug(
      "[CESIUM|SCENE|POLYLINE] adding Stemline",
      posTop.height,
      posBase.height
    );
    const stemlineCollection = new PolylineCollection();
    stemlineCollection.add(polylineTop);
    stemlineCollection.add(polylineBottom);
    ctx.withScene((scene) => {
      scene.primitives.add(stemlineCollection);
    });
    markerData.stemline = stemlineCollection;
  }
};

export const addCesiumMarker = async (
  ctx: CesiumCtx,
  pos: Cartographic,
  groundPos: Cartographic,
  modelConfig: ModelAsset, // TODO integrate modelconfig to options
  options: {
    model?: Model;
    id?: string;
    stemline?: PolylineConfig; // override the modelConfig stemline
  } = {}
) => {
  console.debug("[CESIUM|SCENE] addMarker", pos, modelConfig);

  const { id, model } = Object.assign({ ...defaultOptions, ...options });

  const markerData: MarkerPrimitiveData = {
    id,
    modelMatrix: null,
    animatedModelMatrix: null,
    modelConfig: null,
    model: null,
  };

  const posCartesian = Cartesian3.fromRadians(
    pos.longitude,
    pos.latitude,
    pos.height
  );
  const scale = modelConfig?.scale || 1;
  const offset = modelConfig?.anchorOffset || { x: 0, y: 0, z: 0 };
  const offsetZ = offset.z || 0;
  const modelMatrix = Transforms.eastNorthUpToFixedFrame(posCartesian);
  const translation = Matrix4.fromTranslation(
    new Cartesian3(0, 0, offsetZ * scale)
  );
  Matrix4.multiply(modelMatrix, translation, modelMatrix);

  markerData.modelConfig = modelConfig;
  markerData.modelMatrix = modelMatrix.clone();
  markerData.animatedModelMatrix = modelMatrix.clone();

  let markerModel: Model;

  if (model) {
    console.debug("[CESIUM|MARKER|MODEL] Reusing existing marker Model");
    // reuuse existing model;
    markerModel = model;
    model.modelMatrix = modelMatrix;
    model.scale = modelConfig.scale ?? 1;
  } else {
    console.debug(
      "[CESIUM|MARKER|MODEL] creating marker model from file",
      modelConfig.uri
    );
    markerModel = await Model.fromGltfAsync({
      id,
      url: modelConfig.uri,
      modelMatrix: modelMatrix,
      scale: modelConfig.scale,
    });
  }

  try {
    // Add the stemline if configured
    if (options.stemline || modelConfig.stemline) {
      createOrUpdateStemline(ctx, markerData, [pos, groundPos], {
        ...modelConfig.stemline,
        ...options.stemline,
      });
    }
  } catch (e) {
    console.error("[CESIUM|MARKER] error adding/updating stemline", e);
  }

  markerData.model = markerModel;

  if (markerModel.isDestroyed()) {
    console.warn("[CESIUM|MARKER] marker model is destroyed");
    return;
  } else {
    ctx.withScene((scene) => {
      scene.primitives.add(markerModel);
    });
  }

  const onPreUpdate = () => updateMarker(ctx, markerData);
  ctx.withScene((scene) => {
    scene.preUpdate.addEventListener(onPreUpdate);
  });
  ctx.requestRender();

  markerData.onPreUpdate = onPreUpdate;
  markerData.cleanup = () => {
    console.debug(
      "[CESIUM|SCENE|MARKER|LISTENER] cleaning up preUpdate Listener for",
      markerData.id
    );
    ctx.withScene((scene) => {
      scene.preUpdate.removeEventListener(onPreUpdate);
    });
  };

  return markerData;
};

const updateMarker = (ctx: CesiumCtx, markerData: MarkerPrimitiveData) => {
  const {
    modelMatrix,
    animatedModelMatrix,
    animationSpeed,
    model,
    modelConfig,
  } = markerData;

  if (modelConfig !== null) {
    const { isCameraFacing, rotation, fixedScale } = modelConfig;
    const currentTime = new Date().getTime();
    if (markerData.lastRenderTime === undefined) {
      markerData.lastRenderTime = currentTime;
    }
    const deltaTime = currentTime - markerData.lastRenderTime;
    markerData.lastRenderTime = currentTime;

    if (model && modelMatrix && animatedModelMatrix) {
      let scale;
      let translation = new Cartesian3(0, 0, 0);
      if (fixedScale) {
        ctx.withCamera((camera) => {
          const dist = Cartesian3.distance(
            camera.position,
            new Cartesian3(modelMatrix[12], modelMatrix[13], modelMatrix[14])
          );
          if (dist) {
            scale = new Cartesian3(dist / 1000, dist / 1000, dist / 1000);
            translation = new Cartesian3(
              0,
              0,
              ((modelConfig.scale ?? 1) * dist) / (1000 * 0.5)
            ); // offset to scale from bottom
          }
        });
      } else {
        scale = new Cartesian3(1, 1, 1);
      }

      if (rotation && animationSpeed) {
        const RotationQuaternion = Quaternion.fromAxisAngle(
          Cartesian3.UNIT_Z,
          (rotation === true ? 1 : rotation) * animationSpeed * deltaTime
        );

        const rotationMatrix = Matrix4.fromTranslationQuaternionRotationScale(
          translation,
          RotationQuaternion,
          scale
        );
        const updatedModelMatrix = Matrix4.clone(animatedModelMatrix);
        Matrix4.multiply(
          updatedModelMatrix,
          rotationMatrix,
          updatedModelMatrix
        );
        markerData.animatedModelMatrix = updatedModelMatrix;
        markerData.model.modelMatrix = updatedModelMatrix;
      } else if (isCameraFacing) {
        ctx.withCamera((camera) => {
          const cameraHeading = camera.heading;
          const rotationQuaternion = Quaternion.fromAxisAngle(
            Cartesian3.UNIT_Z,
            -cameraHeading - CesiumMath.PI_OVER_TWO
          );
          const rotationMatrix = Matrix4.fromTranslationQuaternionRotationScale(
            translation,
            rotationQuaternion,
            scale
          );
          const updatedModelMatrix = Matrix4.clone(modelMatrix);
          Matrix4.multiply(
            updatedModelMatrix,
            rotationMatrix,
            updatedModelMatrix
          );
          markerData.animatedModelMatrix = updatedModelMatrix;
          if (markerData.model) {
            markerData.model.modelMatrix = updatedModelMatrix;
          }
        });
      }
    }
  }
  return markerData;
};

export const removeCesiumMarker = (
  ctx: CesiumCtx,
  data: MarkerPrimitiveData | null | undefined
) => {
  console.debug(
    "[CESIUM|MARKER] removing marker primitive from scene",
    data?.model,
    data
  );
  if (data) {
    // remove listeners before removing the primitives
    // so no updates are triggered after the primitive is removed
    data.cleanup && data.cleanup();
    ctx.withScene(async (scene) => {
      try {
        data.model &&
          !data.model.isDestroyed() &&
          !scene.primitives.isDestroyed() &&
          scene.primitives.remove(data.model);
      } catch (e) {
        console.error("[CESIUM|MARKER] error removing model", e);
      }
      ctx.requestRender();
    });
    ctx.withScene(async (scene) => {
      try {
        const hasValidStemline = data.stemline && !data.stemline.isDestroyed();

        const hasValidCollection =
          scene.primitives && !scene.primitives.isDestroyed();

        const isInCollection = scene.primitives.contains(data.stemline);
        console.debug(
          "[CESIUM|MARKER] removing stemline",
          data.stemline,
          hasValidStemline,
          hasValidCollection,
          isInCollection
        );
        if (hasValidStemline && hasValidCollection && isInCollection) {
          scene.primitives.remove(data.stemline);
        }
      } catch (e) {
        // Expected during scene reinitialization (2D↔3D transitions)
        // Primitives from old scene are destroyed - silently skip
        console.debug(
          "[CESIUM|MARKER] stemline already destroyed (likely scene transition)",
          e
        );
      }
      ctx.requestRender();
    });
  }
};
