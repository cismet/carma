import { Cesium3DTileset, Color, CustomShader } from "@carma-cesium";
import { Cesium3DTileStyle } from "cesium";
import { colorFromConstructorArgs } from "@carma-mapping/engines/cesium/core";
import { createResourceInitSignature } from "./resourceSignatures";

import type { CesiumContextType } from "../CesiumContext";
import type {
  CesiumSceneStyleChange,
  CesiumSceneStyleChangeMode,
  CesiumSceneStyleChangeSet,
  CesiumSceneStyleDiff,
  CesiumSceneResourceInitSignatures,
  CesiumTilesetSceneMember,
  SceneStyle,
} from "../index.d";
import {
  DEFAULT_SURFACE_PROVIDER_ID,
  DEFAULT_TERRAIN_PROVIDER_ID,
} from "./cesiumProviders";

const managedCustomShaders = new WeakMap<Cesium3DTileset, CustomShader>();
const managedTileStyles = new WeakMap<Cesium3DTileset, Cesium3DTileStyle>();
const appliedTilesetAppearances = new WeakMap<
  Cesium3DTileset,
  CesiumTilesetSceneMember["appearance"]
>();

const idsEqual = (left: readonly string[], right: readonly string[]) => {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((id, index) => id === right[index]);
};

const getImageryMemberIds = (style?: SceneStyle) =>
  style?.members?.imageryLayers?.map(({ id }) => id) ?? [];

const getTilesetMemberIds = (style?: SceneStyle) =>
  style?.members?.tilesets?.map(({ id }) => id) ?? [];

const getResourceSignature = (
  signatures: Readonly<Record<string, string | undefined>> | undefined,
  id: string
) => signatures?.[id] ?? `missing:${id}`;

const getTerrainProviderResourceSignature = (
  style: SceneStyle | undefined,
  member: "terrainProviderId" | "surfaceProviderId",
  fallbackId: string,
  resourceInitSignatures?: CesiumSceneResourceInitSignatures
) => {
  const id = style?.members?.[member] ?? fallbackId;
  return getResourceSignature(resourceInitSignatures?.terrainProviders, id);
};

const getTilesetResourceSignatures = (
  style: SceneStyle | undefined,
  resourceInitSignatures?: CesiumSceneResourceInitSignatures
) =>
  style?.members?.tilesets?.map(({ id }) =>
    getResourceSignature(resourceInitSignatures?.tilesets, id)
  ) ?? [];

const styleValueSignature = (value: unknown): string =>
  createResourceInitSignature(value);

const valuesEqual = (left: unknown, right: unknown): boolean =>
  styleValueSignature(left) === styleValueSignature(right);

const addValueChange = (
  changes: CesiumSceneStyleChange[],
  path: string,
  previousValue: unknown,
  nextValue: unknown,
  reason: string,
  mode: CesiumSceneStyleChangeMode = "live"
) => {
  if (!valuesEqual(previousValue, nextValue)) {
    changes.push({ path, mode, reason });
  }
};

const getDominantMode = (
  changes: readonly CesiumSceneStyleChange[]
): CesiumSceneStyleChangeMode => {
  if (changes.some((change) => change.mode === "runtime-reinit")) {
    return "runtime-reinit";
  }
  if (changes.some((change) => change.mode === "resource-reload")) {
    return "resource-reload";
  }
  return "live";
};

const getChangeReasons = (
  changes: readonly CesiumSceneStyleChange[]
): readonly string[] => {
  const reasons = [...new Set(changes.map(({ reason }) => reason))];
  return reasons.length > 0 ? reasons : ["only live scene values changed"];
};

export const diffCesiumSceneStyles = (
  previous?: SceneStyle,
  next?: SceneStyle,
  resourceInitSignatures?: CesiumSceneResourceInitSignatures
): CesiumSceneStyleChangeSet => {
  if (!previous || !next) {
    return {
      mode: "live",
      reasons: ["initial scene style application"],
      changes: [
        {
          path: "sceneStyle",
          mode: "live",
          reason: "initial scene style application",
        },
      ],
    };
  }

  const changes: CesiumSceneStyleChange[] = [];

  if (previous.runtimeProfileId !== next.runtimeProfileId) {
    changes.push({
      path: "runtimeProfileId",
      mode: "runtime-reinit",
      reason: "runtimeProfileId changed",
    });
  }

  const previousTerrainProviderId =
    previous.members?.terrainProviderId ?? DEFAULT_TERRAIN_PROVIDER_ID;
  const nextTerrainProviderId =
    next.members?.terrainProviderId ?? DEFAULT_TERRAIN_PROVIDER_ID;
  const previousTerrainSignature = getTerrainProviderResourceSignature(
    previous,
    "terrainProviderId",
    DEFAULT_TERRAIN_PROVIDER_ID,
    resourceInitSignatures
  );
  const nextTerrainSignature = getTerrainProviderResourceSignature(
    next,
    "terrainProviderId",
    DEFAULT_TERRAIN_PROVIDER_ID,
    resourceInitSignatures
  );

  if (previousTerrainSignature !== nextTerrainSignature) {
    changes.push({
      path: "members.terrainProviderId",
      mode: "resource-reload",
      reason: "terrain provider init options changed",
    });
  } else {
    addValueChange(
      changes,
      "members.terrainProviderId",
      previousTerrainProviderId,
      nextTerrainProviderId,
      "terrain provider id changed without init option change"
    );
  }

  const previousSurfaceProviderId =
    previous.members?.surfaceProviderId ?? DEFAULT_SURFACE_PROVIDER_ID;
  const nextSurfaceProviderId =
    next.members?.surfaceProviderId ?? DEFAULT_SURFACE_PROVIDER_ID;
  const previousSurfaceSignature = getTerrainProviderResourceSignature(
    previous,
    "surfaceProviderId",
    DEFAULT_SURFACE_PROVIDER_ID,
    resourceInitSignatures
  );
  const nextSurfaceSignature = getTerrainProviderResourceSignature(
    next,
    "surfaceProviderId",
    DEFAULT_SURFACE_PROVIDER_ID,
    resourceInitSignatures
  );

  if (previousSurfaceSignature !== nextSurfaceSignature) {
    changes.push({
      path: "members.surfaceProviderId",
      mode: "resource-reload",
      reason: "surface provider init options changed",
    });
  } else {
    addValueChange(
      changes,
      "members.surfaceProviderId",
      previousSurfaceProviderId,
      nextSurfaceProviderId,
      "surface provider id changed without init option change"
    );
  }

  const previousImageryIds = getImageryMemberIds(previous);
  const nextImageryIds = getImageryMemberIds(next);
  if (!idsEqual(previousImageryIds, nextImageryIds)) {
    changes.push({
      path: "members.imageryLayers",
      mode: "resource-reload",
      reason: "imagery layer members changed",
    });
  }

  const previousImageryMembersById = new Map(
    previous.members?.imageryLayers?.map((member) => [member.id, member]) ?? []
  );
  for (const nextMember of next.members?.imageryLayers ?? []) {
    const previousMember = previousImageryMembersById.get(nextMember.id);
    if (previousMember) {
      addValueChange(
        changes,
        `members.imageryLayers.${nextMember.id}.opacity`,
        previousMember.opacity,
        nextMember.opacity,
        "imagery layer opacity changed"
      );
    }
  }

  const previousTilesetIds = getTilesetMemberIds(previous);
  const nextTilesetIds = getTilesetMemberIds(next);
  const previousTilesetSignatures = getTilesetResourceSignatures(
    previous,
    resourceInitSignatures
  );
  const nextTilesetSignatures = getTilesetResourceSignatures(
    next,
    resourceInitSignatures
  );

  if (!idsEqual(previousTilesetSignatures, nextTilesetSignatures)) {
    changes.push({
      path: "members.tilesets",
      mode: "resource-reload",
      reason: "tileset init options changed",
    });
  } else if (!idsEqual(previousTilesetIds, nextTilesetIds)) {
    changes.push({
      path: "members.tilesets",
      mode: "live",
      reason: "tileset member ids changed without init option change",
    });
  }

  const previousTilesetMembersById = new Map(
    previous.members?.tilesets?.map((member) => [member.id, member]) ?? []
  );
  for (const nextMember of next.members?.tilesets ?? []) {
    const previousMember = previousTilesetMembersById.get(nextMember.id);
    if (previousMember) {
      addValueChange(
        changes,
        `members.tilesets.${nextMember.id}.appearance`,
        previousMember.appearance,
        nextMember.appearance,
        "tileset appearance changed"
      );
    }
  }

  addValueChange(
    changes,
    "live.scene.backgroundColor",
    previous.live?.scene?.backgroundColor,
    next.live?.scene?.backgroundColor,
    "scene background color changed"
  );
  addValueChange(
    changes,
    "live.globe.baseColor",
    previous.live?.globe?.baseColor,
    next.live?.globe?.baseColor,
    "globe base color changed"
  );
  addValueChange(
    changes,
    "live.globe.depthTestAgainstTerrain",
    previous.live?.globe?.depthTestAgainstTerrain,
    next.live?.globe?.depthTestAgainstTerrain,
    "globe depth test changed"
  );
  addValueChange(
    changes,
    "live.globe.enableLighting",
    previous.live?.globe?.enableLighting,
    next.live?.globe?.enableLighting,
    "globe lighting changed"
  );
  addValueChange(
    changes,
    "live.globe.translucency.enabled",
    previous.live?.globe?.translucency?.enabled,
    next.live?.globe?.translucency?.enabled,
    "globe translucency enabled changed"
  );
  addValueChange(
    changes,
    "live.globe.translucency.frontFaceAlpha",
    previous.live?.globe?.translucency?.frontFaceAlpha,
    next.live?.globe?.translucency?.frontFaceAlpha,
    "globe translucency front face alpha changed"
  );
  addValueChange(
    changes,
    "live.globe.translucency.backFaceAlpha",
    previous.live?.globe?.translucency?.backFaceAlpha,
    next.live?.globe?.translucency?.backFaceAlpha,
    "globe translucency back face alpha changed"
  );

  const mode = getDominantMode(changes);
  return {
    mode,
    reasons: getChangeReasons(changes),
    changes,
  };
};

export const classifyCesiumSceneStyleChange = (
  previous?: SceneStyle,
  next?: SceneStyle,
  resourceInitSignatures?: CesiumSceneResourceInitSignatures
): CesiumSceneStyleDiff => {
  const diff = diffCesiumSceneStyles(previous, next, resourceInitSignatures);
  return {
    mode: diff.mode,
    reasons: diff.reasons,
  };
};

export const applyTilesetSceneMember = (
  tileset: Cesium3DTileset,
  member: CesiumTilesetSceneMember
) => {
  const appearance = member.appearance;
  if (appliedTilesetAppearances.get(tileset) === appearance) {
    return;
  }

  if (appearance?.type === "custom-shader") {
    clearManagedTileStyle(tileset);
    tileset.style = undefined;
    destroyManagedCustomShader(tileset);

    const shader = new CustomShader(appearance.shader);
    tileset.customShader = shader;
    managedCustomShaders.set(tileset, shader);
  } else if (appearance?.type === "cesium-3d-tile-style") {
    destroyManagedCustomShader(tileset);
    tileset.customShader = undefined;
    clearManagedTileStyle(tileset);

    try {
      const style = new Cesium3DTileStyle(appearance.style);
      tileset.style = style;
      managedTileStyles.set(tileset, style);
    } catch (error) {
      console.warn(
        "[STYLES|TILESET|CESIUM] Failed to create Cesium3DTileStyle",
        member.id,
        error
      );
      tileset.style = undefined;
    }
  } else {
    destroyManagedCustomShader(tileset);
    tileset.customShader = undefined;
    clearManagedTileStyle(tileset);
    tileset.style = undefined;
  }

  appliedTilesetAppearances.set(tileset, appearance);
};

const syncTerrainProvider = (
  ctx: CesiumContextType,
  style?: SceneStyle,
  previousStyle?: SceneStyle
) => {
  const providerId =
    style?.members?.terrainProviderId ?? DEFAULT_TERRAIN_PROVIDER_ID;
  const previousProviderId =
    previousStyle?.members?.terrainProviderId ?? DEFAULT_TERRAIN_PROVIDER_ID;
  const providerSignature = ctx.getTerrainProviderInitSignatureById(providerId);
  const previousProviderSignature =
    ctx.getTerrainProviderInitSignatureById(previousProviderId);

  if (
    previousStyle &&
    providerSignature &&
    providerSignature === previousProviderSignature
  ) {
    return;
  }

  const provider =
    ctx.getTerrainProviderById(providerId) ??
    ctx.getTerrainProviderById(DEFAULT_TERRAIN_PROVIDER_ID);

  if (!provider) {
    console.warn(
      "[STYLES|TERRAIN|CESIUM] Missing terrain provider",
      providerId
    );
    return;
  }

  ctx.withScene((scene) => {
    if (scene.terrainProvider !== provider) {
      scene.terrainProvider = provider;
      scene.requestRender();
    }
  });
};

const syncImageryLayers = (
  ctx: CesiumContextType,
  style?: SceneStyle,
  previousStyle?: SceneStyle
) => {
  const nextMembers = style?.members?.imageryLayers ?? [];
  const nextIds = new Set(nextMembers.map(({ id }) => id));
  const previousIds = new Set(
    previousStyle?.members?.imageryLayers?.map(({ id }) => id) ?? []
  );

  for (const id of previousIds) {
    if (!nextIds.has(id)) {
      ctx.withImageryLayerById(id, (imageryLayer, scene) => {
        const layers = scene.imageryLayers;
        imageryLayer.show = false;
        if (layers.contains(imageryLayer)) {
          layers.remove(imageryLayer, false);
        }
        scene.requestRender();
        return true;
      });
    }
  }

  for (const imageryMember of nextMembers) {
    ctx.withImageryLayerById(imageryMember.id, (imageryLayer, scene) => {
      const layers = scene.imageryLayers;
      const alreadyAdded = layers.contains(imageryLayer);
      const wasShown = imageryLayer.show;

      if (alreadyAdded && !wasShown) {
        layers.remove(imageryLayer, false);
      }

      imageryLayer.show = true;
      if (imageryMember.opacity !== undefined) {
        imageryLayer.alpha = imageryMember.opacity;
      }

      if (!alreadyAdded || !wasShown) {
        layers.add(imageryLayer);
      }
      layers.raiseToTop(imageryLayer);
      scene.requestRender();
      return true;
    });
  }
};

export const setupSceneStyle = (
  ctx: CesiumContextType,
  style?: SceneStyle,
  previousStyle?: SceneStyle
) => {
  ctx.withScene((scene) => {
    const globeStyle = style?.live?.globe;
    if (scene.globe) {
      scene.globe.baseColor =
        colorFromConstructorArgs(globeStyle?.baseColor) ?? Color.LIGHTGREY;
      if (globeStyle?.depthTestAgainstTerrain !== undefined) {
        scene.globe.depthTestAgainstTerrain =
          globeStyle.depthTestAgainstTerrain;
      }
      if (globeStyle?.enableLighting !== undefined) {
        scene.globe.enableLighting = globeStyle.enableLighting;
      }
      scene.globe.translucency.enabled =
        globeStyle?.translucency?.enabled ?? false;
      scene.globe.translucency.frontFaceAlpha =
        globeStyle?.translucency?.frontFaceAlpha ?? 1.0;
      scene.globe.translucency.backFaceAlpha =
        globeStyle?.translucency?.backFaceAlpha ?? 1.0;
    }
    scene.backgroundColor =
      colorFromConstructorArgs(style?.live?.scene?.backgroundColor) ??
      new Color(0, 0, 0, 0);
  });

  syncTerrainProvider(ctx, style, previousStyle);
  syncImageryLayers(ctx, style, previousStyle);

  ctx.requestRender({ repeat: 3, repeatInterval: 80 });
};
