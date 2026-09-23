import * as THREE from "three";

import { clamp } from "@carma-commons/math";

import type { SharedThreeSceneShadowStyle } from "../../core/shared-three-scene-types";
import type {
  ThreeTilesRuntimeServices,
  ThreeTilesRuntimeState,
} from "./three-tiles-runtime-context";
import type {
  ClayMaterialOptions,
  OutlineStyleOptions,
} from "./three-tiles-runtime-types";
import { TILE_OUTLINE_FLAG } from "./three-tiles-runtime-vendor";
import { createThreeTilesMaterialManagement } from "./three-tiles-runtime-materials";

/** appearance responsibility of the shared 3D Tiles runtime. */
export function createThreeTilesAppearance(
  runtimeState: Pick<
    ThreeTilesRuntimeState,
    | "shadowSimulationStyle"
    | "shadowClayColor"
    | "clayColor"
    | "clayRoughness"
    | "clayMetalness"
    | "clayMaterialStates"
    | "originalShadowSides"
    | "originalRenderSides"
    | "litTextureMaterialStates"
    | "separatedSurfaceRenderSides"
    | "whiteShading"
    | "shadowAppearanceUniforms"
    | "options"
    | "outlineVisible"
    | "opacity"
    | "wireframe"
    | "mapStyleProjectionVersion"
    | "materialRevision"
    | "tiles"
    | "outlineColor"
    | "outlineOpacity"
    | "orientationGroup"
    | "map"
  >,
  dependencies: Pick<
    ThreeTilesRuntimeServices,
    | "resolveRenderSide"
    | "asMaterialArray"
    | "normalizeSeparatedBuildingSurfaces"
    | "patchMaterialForProjection"
    | "applyCacheBudget"
  >
) {
  const shadowStylesEqual: ThreeTilesRuntimeServices["shadowStylesEqual"] = (
    first: SharedThreeSceneShadowStyle | null,
    second: SharedThreeSceneShadowStyle | null
  ) =>
    first === second ||
    (first !== null &&
      second !== null &&
      first.fullOpacity === second.fullOpacity &&
      first.uniformColor === second.uniformColor &&
      first.uniformColorMix === second.uniformColorMix &&
      first.textureSaturation === second.textureSaturation &&
      first.textureColorCorrection === second.textureColorCorrection);

  const {
    buildClayMaterial,
    buildLitTextureMaterial,
    disposeClayState,
    restoreClayMaterials,
    disposeLitTextureState,
    restoreLitTextureMaterials,
    applyShadowCastingSide,
    restoreShadowSides,
    applyMaterialFlags,
  } = createThreeTilesMaterialManagement(runtimeState, dependencies);

  const refreshRenderedMaterials: ThreeTilesRuntimeServices["refreshRenderedMaterials"] =
    (root: THREE.Object3D) => {
      const groupWide = root === runtimeState.orientationGroup;
      // A group-wide restyle reaches the tiles attached right now. A tile
      // hidden at this moment catches up when it next becomes visible
      // (`handleTileVisibilityChange`), a tile still loading when it arrives:
      // both compare their stamp against this revision.
      if (groupWide) runtimeState.materialRevision += 1;
      applyMaterialFlags(root);
      if (groupWide)
        for (const tile of runtimeState.tiles?.visibleTiles ?? []) {
          const scene = (tile as { engineData?: { scene?: THREE.Object3D } })
            .engineData?.scene;
          if (scene)
            scene.userData.materialRevision = runtimeState.materialRevision;
        }
      runtimeState.mapStyleProjectionVersion += 1;
    };

  const applyOutlineVisibility: ThreeTilesRuntimeServices["applyOutlineVisibility"] =
    (root: THREE.Object3D) => {
      root.traverse((object) => {
        // Outlines follow the style's `outline` alone; shadow mode does not
        // hide them.
        if (object.userData[TILE_OUTLINE_FLAG]) {
          object.visible = runtimeState.outlineVisible;
        }
      });
    };

  const applyOutlineStyle: ThreeTilesRuntimeServices["applyOutlineStyle"] = (
    root: THREE.Object3D
  ) => {
    root.traverse((object) => {
      if (!object.userData[TILE_OUTLINE_FLAG]) return;
      const outline = object as THREE.LineSegments;
      for (const material of dependencies.asMaterialArray(outline.material)) {
        if (!(material instanceof THREE.LineBasicMaterial)) continue;
        material.color.set(runtimeState.outlineColor);
        material.opacity = runtimeState.outlineOpacity;
        material.transparent = runtimeState.outlineOpacity < 1;
        material.needsUpdate = true;
      }
    });
  };

  const setShadowSimulationStyle: ThreeTilesRuntimeServices["setShadowSimulationStyle"] =
    (style) => {
      // Keep shadow activation independent of optional appearance overrides.
      // See ../../../../README.md#shadow-activation-and-declared-mesh-appearance.
      if (shadowStylesEqual(runtimeState.shadowSimulationStyle, style)) return;
      runtimeState.shadowSimulationStyle = style;
      // Reapply one bounded cache policy when shadow mode changes. The shadow
      // camera may add off-screen casters, but it must not create a separate
      // download-admission ceiling or bypass the memory limit.
      dependencies.applyCacheBudget();
      if (runtimeState.options.shadowBuildingStyle && style?.uniformColor)
        runtimeState.shadowClayColor.set(style.uniformColor);
      refreshRenderedMaterials(runtimeState.orientationGroup);
      applyOutlineVisibility(runtimeState.orientationGroup);
      runtimeState.map?.triggerRepaint();
    };

  const setWhiteShading: ThreeTilesRuntimeServices["setWhiteShading"] = (
    white: boolean
  ) => {
    runtimeState.whiteShading = white;
    refreshRenderedMaterials(runtimeState.orientationGroup);
    runtimeState.map?.triggerRepaint();
  };

  const setClayMaterial: ThreeTilesRuntimeServices["setClayMaterial"] = (
    options: ClayMaterialOptions
  ) => {
    if (options.color !== undefined) runtimeState.clayColor.set(options.color);
    if (options.roughness !== undefined) {
      runtimeState.clayRoughness = clamp(options.roughness, 0, 1);
    }
    if (options.metalness !== undefined) {
      runtimeState.clayMetalness = clamp(options.metalness, 0, 1);
    }
    for (const state of runtimeState.clayMaterialStates.values()) {
      for (const material of dependencies.asMaterialArray(state.clay)) {
        if (!(material instanceof THREE.MeshStandardMaterial)) continue;
        material.color.copy(runtimeState.clayColor);
        material.roughness = runtimeState.clayRoughness;
        material.metalness = runtimeState.clayMetalness;
        material.needsUpdate = true;
      }
    }
    refreshRenderedMaterials(runtimeState.orientationGroup);
    runtimeState.map?.triggerRepaint();
  };

  const setClayColor: ThreeTilesRuntimeServices["setClayColor"] = (
    color: string
  ) => {
    setClayMaterial({ color });
  };

  const setOpacity: ThreeTilesRuntimeServices["setOpacity"] = (
    nextOpacity: number
  ) => {
    runtimeState.opacity = clamp(nextOpacity, 0, 1);
    refreshRenderedMaterials(runtimeState.orientationGroup);
    runtimeState.map?.triggerRepaint();
  };

  const setWireframe: ThreeTilesRuntimeServices["setWireframe"] = (
    enabled: boolean
  ) => {
    runtimeState.wireframe = enabled;
    refreshRenderedMaterials(runtimeState.orientationGroup);
    runtimeState.map?.triggerRepaint();
  };

  const setOutlineVisible: ThreeTilesRuntimeServices["setOutlineVisible"] = (
    visible: boolean
  ) => {
    runtimeState.outlineVisible = visible;
    applyOutlineVisibility(runtimeState.orientationGroup);
    runtimeState.map?.triggerRepaint();
  };

  const setOutlineStyle: ThreeTilesRuntimeServices["setOutlineStyle"] = (
    style: OutlineStyleOptions
  ) => {
    if (style.color !== undefined) runtimeState.outlineColor = style.color;
    if (style.opacity !== undefined) {
      runtimeState.outlineOpacity = clamp(style.opacity, 0, 1);
    }
    applyOutlineStyle(runtimeState.orientationGroup);
    runtimeState.map?.triggerRepaint();
  };
  const mapStyleProjectionVersion: ThreeTilesRuntimeServices["mapStyleProjectionVersion"] =
    () => runtimeState.mapStyleProjectionVersion;

  return {
    mapStyleProjectionVersion,
    shadowStylesEqual,
    buildClayMaterial,
    buildLitTextureMaterial,
    disposeClayState,
    restoreClayMaterials,
    disposeLitTextureState,
    restoreLitTextureMaterials,
    applyShadowCastingSide,
    restoreShadowSides,
    applyMaterialFlags,
    refreshRenderedMaterials,
    applyOutlineVisibility,
    applyOutlineStyle,
    setShadowSimulationStyle,
    setWhiteShading,
    setClayMaterial,
    setClayColor,
    setOpacity,
    setWireframe,
    setOutlineVisible,
    setOutlineStyle,
  };
}
