import {
  Cartesian3,
  Matrix4,
  Transforms,
  Quaternion,
  Viewer,
  Model,
  Cartographic,
  Math as CesiumMath,
  Material,
  Color,
  PolylineCollection,
} from "cesium";

import type { EntityData, ModelAsset, PolylineConfig } from "../..";

const defaultOptions = {
  id: "selected3dmarker",
};

const createOrUpdateStemline = (
  viewer: Viewer,
  entityData: EntityData,
  [pos, groundPos]: Cartographic[],
  options: Partial<PolylineConfig> = {},
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

  const positions = viewer.scene.ellipsoid.cartographicArrayToCartesianArray([
    posTop,
    posCenter,
    posBase,
  ]);
  const width = options.width ?? 4;

  if (entityData.stemline) {
    entityData.stemline.positions = positions;
    entityData.stemline.width = width;
    entityData.stemline.material = material;
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
    console.info(
      "[CESIUM|SCENE|POLYLINE] adding Stemline",
      posTop.height,
      posBase.height,
    );
    const stemlineCollection = new PolylineCollection();
    stemlineCollection.add(polylineTop);
    stemlineCollection.add(polylineBottom);
    viewer.scene.primitives.add(stemlineCollection);
    entityData.stemline = stemlineCollection;
  }
};

export const addCesiumMarker = async (
  viewer: Viewer,
  pos: Cartographic,
  groundPos: Cartographic,
  modelConfig: ModelAsset, // TODO integrate modelconfig to options
  options: {
    model?: Model;
    id?: string;
    stemline?: PolylineConfig; // override the modelConfig stemline
  } = {},
) => {
  console.info("[CESIUM|SCENE] addMarker", pos, modelConfig);

  const { id, model } = Object.assign({ ...defaultOptions, ...options });

  const entityData: EntityData = {
    id,
    modelMatrix: null,
    animatedModelMatrix: null,
    modelConfig: null,
    model: null,
  };

  const posCartesian = Cartesian3.fromRadians(
    pos.longitude,
    pos.latitude,
    pos.height,
  );
  const scale = modelConfig?.scale || 1;
  const offset = modelConfig?.anchorOffset || { x: 0, y: 0, z: 0 };
  const offsetZ = offset.z || 0;
  const modelMatrix = Transforms.eastNorthUpToFixedFrame(posCartesian);
  const translation = Matrix4.fromTranslation(
    new Cartesian3(0, 0, offsetZ * scale),
  );
  Matrix4.multiply(modelMatrix, translation, modelMatrix);

  entityData.modelConfig = modelConfig;
  entityData.modelMatrix = modelMatrix.clone();
  entityData.animatedModelMatrix = modelMatrix.clone();

  let markerModel: Model;

  if (model) {
    console.info("[CESIUM|MARKER|MODEL] Reusing existing marker Model");
    // reuuse existing model;
    markerModel = model;
    model.modelMatrix = modelMatrix;
    model.scale = modelConfig.scale ?? 1;
  } else {
    console.info(
      "[CESIUM|MARKER|MODEL] creating marker model from file",
      modelConfig.uri,
    );
    markerModel = await Model.fromGltfAsync({
      id,
      url: modelConfig.uri,
      modelMatrix: modelMatrix,
      scale: modelConfig.scale,
    });
  }

  // Add the stemline if configured
  if (options.stemline || modelConfig.stemline) {
    createOrUpdateStemline(viewer, entityData, [pos, groundPos], {
      ...modelConfig.stemline,
      ...options.stemline,
    });
  }

  entityData.model = markerModel;

  viewer.scene.primitives.add(markerModel);

  const onPreUpdate = () => updateMarker(viewer, entityData);
  viewer.scene.preUpdate.addEventListener(onPreUpdate);
  viewer.scene.requestRender();

  entityData.onPreUpdate = onPreUpdate;
  entityData.cleanup = () => {
    console.info(
      "[CESIUM|SCENE|MARKER|LISTENER] cleaning up preUpdate Listener for",
      entityData.id,
    );
    viewer.scene.preUpdate.removeEventListener(onPreUpdate);
  };

  return entityData;
};

const updateMarker = (viewer: Viewer, entityData: EntityData) => {
  const {
    modelMatrix,
    animatedModelMatrix,
    animationSpeed,
    model,
    modelConfig,
  } = entityData;

  if (modelConfig !== null) {
    const { isCameraFacing, rotation, fixedScale } = modelConfig;
    const currentTime = new Date().getTime();
    if (entityData.lastRenderTime === undefined) {
      entityData.lastRenderTime = currentTime;
    }
    const deltaTime = currentTime - entityData.lastRenderTime;
    entityData.lastRenderTime = currentTime;

    if (model && modelMatrix && animatedModelMatrix) {
      let scale;
      let translation = new Cartesian3(0, 0, 0);
      if (fixedScale) {
        const dist = Cartesian3.distance(
          viewer.camera.position,
          new Cartesian3(modelMatrix[12], modelMatrix[13], modelMatrix[14]),
        );
        if (dist) {
          scale = new Cartesian3(dist / 1000, dist / 1000, dist / 1000);
          translation = new Cartesian3(
            0,
            0,
            ((modelConfig.scale ?? 1) * dist) / (1000 * 0.5),
          ); // offset to scale from bottom
        }
      } else {
        scale = new Cartesian3(1, 1, 1);
      }

      if (rotation && animationSpeed) {
        const RotationQuaternion = Quaternion.fromAxisAngle(
          Cartesian3.UNIT_Z,
          (rotation === true ? 1 : rotation) * animationSpeed * deltaTime,
        );

        const rotationMatrix = Matrix4.fromTranslationQuaternionRotationScale(
          translation,
          RotationQuaternion,
          scale,
        );
        const updatedModelMatrix = Matrix4.clone(animatedModelMatrix);
        Matrix4.multiply(
          updatedModelMatrix,
          rotationMatrix,
          updatedModelMatrix,
        );
        entityData.animatedModelMatrix = updatedModelMatrix;
        entityData.model.modelMatrix = updatedModelMatrix;
      } else if (isCameraFacing) {
        const cameraHeading = viewer.camera.heading;
        const rotationQuaternion = Quaternion.fromAxisAngle(
          Cartesian3.UNIT_Z,
          -cameraHeading - CesiumMath.PI_OVER_TWO,
        );
        const rotationMatrix = Matrix4.fromTranslationQuaternionRotationScale(
          translation,
          rotationQuaternion,
          scale,
        );
        const updatedModelMatrix = Matrix4.clone(modelMatrix);
        Matrix4.multiply(
          updatedModelMatrix,
          rotationMatrix,
          updatedModelMatrix,
        );
        entityData.animatedModelMatrix = updatedModelMatrix;
        if (entityData.model) {
          entityData.model.modelMatrix = updatedModelMatrix;
        }
      }
    }
  }
  return entityData;
};

export const removeCesiumMarker = (
  viewer: Viewer,
  data: EntityData | null | undefined,
) => {
  console.info(
    "[CESIUM|MARKER] removing marker primitive from scene",
    data?.model,
    data,
  );
  if (data) {
    // remove listeners before removing the primitives
    // so no updates are triggered after the primitive is removed
    data.cleanup && data.cleanup();
    viewer.scene.requestRender();
    try {
      data.model && viewer.scene.primitives.remove(data.model);
    } catch (e) {
      console.error("[CESIUM|MARKER] error removing model", e);
    }
    try {
      data.stemline && viewer.scene.primitives.remove(data.stemline);
    } catch (e) {
      console.error("[CESIUM|MARKER] error removing stemline", e);
    }
  }
};
