import * as THREE from "three";

import { clamp } from "@carma-commons/math";

import { hasDeferredGltfMaterials } from "./gltf-deferred-materials";
import {
  getTileShadowRole,
  setTileShadowMaterialReceiver,
} from "./three-tiles-shadow-role";
import type { SharedThreeSceneShadowStyle } from "../../core/shared-three-scene-types";
import type {
  ThreeTilesRuntimeServices,
  ThreeTilesRuntimeState,
} from "./three-tiles-runtime-context";
import type {
  ClayMaterialOptions,
  ClayMaterialState,
  LitTextureMaterialState,
  OutlineStyleOptions,
} from "./three-tiles-runtime-types";
import { TILE_OUTLINE_FLAG } from "./three-tiles-runtime-vendor";

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

  const buildClayMaterial: ThreeTilesRuntimeServices["buildClayMaterial"] = (
    source: THREE.Material
  ) => {
    const material = new THREE.MeshStandardMaterial({
      color: runtimeState.shadowSimulationStyle?.uniformColor
        ? runtimeState.shadowClayColor
        : runtimeState.clayColor,
      roughness: runtimeState.clayRoughness,
      metalness: runtimeState.clayMetalness,
      // Keep the visible shell outside-facing. The shadow pass uses the side
      // appropriate for a closed building solid or an open terrain surface.
      side: dependencies.resolveRenderSide(source),
      opacity: source.opacity,
      transparent: source.transparent,
      depthTest: true,
      depthWrite: source.depthWrite,
      alphaTest: source.alphaTest,
    });
    material.shadowSide = THREE.DoubleSide;
    material.name = source.name ? `${source.name} · clay` : "tileset-clay";
    return material;
  };

  const buildLitTextureMaterial: ThreeTilesRuntimeServices["buildLitTextureMaterial"] =
    (source: THREE.Material) => {
      const basic = source as THREE.MeshBasicMaterial;
      if (!basic.isMeshBasicMaterial) return source;

      // Mesh 2024 declares KHR_materials_unlit, which GLTFLoader represents as a
      // MeshBasicMaterial. Preserve its source texture and render state, but use
      // the same rough non-metallic PBR path as the regular LoD tiles while
      // shadow mode is active. No mesh-specific lighting shader is involved.
      const material = new THREE.MeshStandardMaterial({
        color: basic.color,
        map: basic.map,
        alphaMap: basic.alphaMap,
        aoMap: basic.aoMap,
        aoMapIntensity: basic.aoMapIntensity,
        lightMap: basic.lightMap,
        lightMapIntensity: basic.lightMapIntensity,
        roughness: 1,
        metalness: 0,
        opacity: basic.opacity,
        transparent: basic.transparent,
        depthTest: basic.depthTest,
        depthWrite: basic.depthWrite,
        alphaTest: basic.alphaTest,
        side: basic.side,
        vertexColors: basic.vertexColors,
        fog: basic.fog,
        wireframe: basic.wireframe,
      });
      material.name = basic.name
        ? `${basic.name} · shadow-lit`
        : "tileset-shadow-lit";
      material.blending = basic.blending;
      material.blendSrc = basic.blendSrc;
      material.blendDst = basic.blendDst;
      material.blendEquation = basic.blendEquation;
      material.colorWrite = basic.colorWrite;
      material.depthFunc = basic.depthFunc;
      material.polygonOffset = basic.polygonOffset;
      material.polygonOffsetFactor = basic.polygonOffsetFactor;
      material.polygonOffsetUnits = basic.polygonOffsetUnits;
      material.toneMapped = basic.toneMapped;
      material.visible = basic.visible;
      material.userData = { ...basic.userData };
      // Decision MESH-CONTACT-BIAS-20260908 (shadow-simulation/three/
      // TILED_SHADOW_PAGES.md): real geometry normals keep sun-away facades dark
      // up to their silhouette; a constant up-normal creates false bright rims.
      delete material.userData.__projPatched;
      delete material.userData.__baseOpacity;
      delete material.userData.__baseTransparent;
      delete material.userData.__baseDepthWrite;
      return material;
    };

  const disposeClayState: ThreeTilesRuntimeServices["disposeClayState"] = (
    mesh: THREE.Mesh,
    state: ClayMaterialState
  ) => {
    mesh.material = state.original;
    for (const material of dependencies.asMaterialArray(state.clay))
      material.dispose();
    runtimeState.clayMaterialStates.delete(mesh);
  };

  const restoreClayMaterials: ThreeTilesRuntimeServices["restoreClayMaterials"] =
    (root: THREE.Object3D) => {
      root.traverse((object) => {
        const mesh = object as THREE.Mesh;
        const state = mesh.isMesh
          ? runtimeState.clayMaterialStates.get(mesh)
          : undefined;
        if (state) disposeClayState(mesh, state);
      });
    };

  const disposeLitTextureState: ThreeTilesRuntimeServices["disposeLitTextureState"] =
    (mesh: THREE.Mesh, state: LitTextureMaterialState) => {
      mesh.material = state.original;
      for (const material of state.generated) {
        if (runtimeState.originalShadowSides.has(material)) {
          material.shadowSide =
            runtimeState.originalShadowSides.get(material) ?? null;
          runtimeState.originalShadowSides.delete(material);
        }
        if (runtimeState.originalRenderSides.has(material)) {
          material.side =
            runtimeState.originalRenderSides.get(material) ?? material.side;
          runtimeState.originalRenderSides.delete(material);
        }
        material.dispose();
      }
      runtimeState.litTextureMaterialStates.delete(mesh);
    };

  const restoreLitTextureMaterials: ThreeTilesRuntimeServices["restoreLitTextureMaterials"] =
    (root: THREE.Object3D) => {
      root.traverse((object) => {
        const mesh = object as THREE.Mesh;
        const state = mesh.isMesh
          ? runtimeState.litTextureMaterialStates.get(mesh)
          : undefined;
        if (state) disposeLitTextureState(mesh, state);
      });
    };

  const applyShadowCastingSide: ThreeTilesRuntimeServices["applyShadowCastingSide"] =
    (material: THREE.Material) => {
      if (runtimeState.shadowSimulationStyle) {
        if (!runtimeState.originalShadowSides.has(material)) {
          runtimeState.originalShadowSides.set(material, material.shadowSide);
        }
        const renderSide =
          runtimeState.separatedSurfaceRenderSides.get(material);
        if (
          renderSide !== undefined &&
          !runtimeState.originalRenderSides.has(material)
        ) {
          runtimeState.originalRenderSides.set(material, material.side);
          material.side = renderSide;
          material.needsUpdate = true;
        }
        // Mesh walls/roofs and photogrammetric surfaces occlude from either side.
        // Decision: MESH-BUDGET-20260908 in engines/maplibre/README.md.
        material.shadowSide = THREE.DoubleSide;
        return;
      }

      if (runtimeState.originalShadowSides.has(material)) {
        material.shadowSide =
          runtimeState.originalShadowSides.get(material) ?? null;
        runtimeState.originalShadowSides.delete(material);
      }
      if (runtimeState.originalRenderSides.has(material)) {
        material.side =
          runtimeState.originalRenderSides.get(material) ?? material.side;
        runtimeState.originalRenderSides.delete(material);
        material.needsUpdate = true;
      }
    };

  const restoreShadowSides: ThreeTilesRuntimeServices["restoreShadowSides"] =
    () => {
      for (const [material, shadowSide] of runtimeState.originalShadowSides) {
        material.shadowSide = shadowSide;
        material.needsUpdate = true;
      }
      runtimeState.originalShadowSides.clear();
      for (const [material, side] of runtimeState.originalRenderSides) {
        material.side = side;
        material.needsUpdate = true;
      }
      runtimeState.originalRenderSides.clear();
    };

  const applyMaterialFlags: ThreeTilesRuntimeServices["applyMaterialFlags"] = (
    root: THREE.Object3D
  ) => {
    dependencies.normalizeSeparatedBuildingSurfaces(root);
    const useClayShading = runtimeState.whiteShading;
    const effectiveClayColor = runtimeState.clayColor;
    runtimeState.shadowAppearanceUniforms.uShadowUniformColorMix.value =
      runtimeState.shadowSimulationStyle?.uniformColor
        ? clamp(runtimeState.shadowSimulationStyle.uniformColorMix ?? 1, 0, 1)
        : 0;
    const correctionEnabled =
      runtimeState.options.colorCorrection !== undefined &&
      runtimeState.shadowSimulationStyle?.textureColorCorrection === true;
    runtimeState.shadowAppearanceUniforms.uShadowTextureSaturation.value =
      clamp(
        (runtimeState.shadowSimulationStyle?.textureSaturation ?? 1) *
          (correctionEnabled
            ? runtimeState.options.colorCorrection?.saturation ?? 1
            : 1),
        0,
        1
      );
    runtimeState.shadowAppearanceUniforms.uShadowTextureColorCorrection.value =
      correctionEnabled;
    const forceOpaque =
      runtimeState.shadowSimulationStyle?.fullOpacity === true;
    root.traverse((object) => {
      // One publication walk owns all per-object render flags. Separate
      // frustum and outline walks multiplied the GLTF commit cost per tile.
      object.frustumCulled = false;
      if (object.userData[TILE_OUTLINE_FLAG]) {
        object.visible = runtimeState.shadowSimulationStyle
          ? false
          : runtimeState.outlineVisible;
      }
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh) return;
      // Decision: MESH-SHADOW-FRUSTUM-20260910 in engines/maplibre/README.md.
      // Three tests the observer AND each light's own frustum independently;
      // an offscreen chimney remains a caster when it intersects the light.
      // Disabling this submits the whole loaded city for every solar sample.
      mesh.frustumCulled = true;
      const role = getTileShadowRole(mesh);
      for (const material of dependencies.asMaterialArray(mesh.material))
        setTileShadowMaterialReceiver(material, true);
      if (hasDeferredGltfMaterials(mesh)) {
        mesh.castShadow = role?.caster ?? true;
        mesh.receiveShadow = false;
        // Transient placeholders never enter the long-lived material-restore maps.
        for (const material of dependencies.asMaterialArray(mesh.material))
          material.shadowSide = runtimeState.shadowSimulationStyle
            ? THREE.DoubleSide
            : null;
        return;
      }
      mesh.castShadow = role?.caster ?? true;
      mesh.receiveShadow = role?.receiver ?? true;
      let clayState = runtimeState.clayMaterialStates.get(mesh);
      let litTextureState = runtimeState.litTextureMaterialStates.get(mesh);
      if (useClayShading) {
        if (litTextureState) {
          disposeLitTextureState(mesh, litTextureState);
          litTextureState = undefined;
        }
        if (!clayState) {
          const original = mesh.material;
          const clay = Array.isArray(original)
            ? original.map(buildClayMaterial)
            : buildClayMaterial(original);
          clayState = { original, clay };
          runtimeState.clayMaterialStates.set(mesh, clayState);
          mesh.material = clay;
        }
      } else {
        if (clayState) {
          disposeClayState(mesh, clayState);
          clayState = undefined;
        }
        const sourceMaterials = dependencies.asMaterialArray(mesh.material);
        const needsLitTextureMaterial =
          runtimeState.options.providesTerrain === true &&
          runtimeState.shadowSimulationStyle !== null &&
          (litTextureState !== undefined ||
            sourceMaterials.some(
              (material) =>
                (material as THREE.MeshBasicMaterial).isMeshBasicMaterial
            ));
        if (needsLitTextureMaterial && !litTextureState) {
          const original = mesh.material;
          const generated: THREE.Material[] = [];
          const buildMaterial = (source: THREE.Material) => {
            const lit = buildLitTextureMaterial(source);
            if (lit !== source) generated.push(lit);
            return lit;
          };
          const lit = Array.isArray(original)
            ? original.map(buildMaterial)
            : buildMaterial(original);
          litTextureState = { original, lit, generated };
          runtimeState.litTextureMaterialStates.set(mesh, litTextureState);
          mesh.material = lit;
        } else if (!needsLitTextureMaterial && litTextureState) {
          disposeLitTextureState(mesh, litTextureState);
          litTextureState = undefined;
        }
      }

      const materials = dependencies.asMaterialArray(mesh.material);
      for (const material of materials) {
        // Clay materials already enforce the correct casting side. Apply it to
        // original textured PBR materials too, then restore their source
        // setting when shadow simulation ends.
        if (!clayState) applyShadowCastingSide(material);
        // The reorientation parent keeps tile coordinates in the same local
        // meter frame and projection as the point layers. Write that shared
        // depth so later point-cloud layers are hidden by nearer mesh faces.
        material.depthTest = true;
        if (material.userData.__baseOpacity === undefined) {
          material.userData.__baseOpacity = material.opacity;
          material.userData.__baseTransparent = material.transparent;
          material.userData.__baseDepthWrite = material.depthWrite;
        }
        const translucent = runtimeState.opacity < 0.999;
        // Full opacity normalizes the source material, not the user's layer
        // opacity. The layer/modal slider is the final multiplier in both modes.
        material.opacity =
          (forceOpaque ? 1 : (material.userData.__baseOpacity as number)) *
          runtimeState.opacity;
        material.transparent =
          translucent ||
          (!forceOpaque && (material.userData.__baseTransparent as boolean));
        material.depthWrite =
          !translucent &&
          (forceOpaque || (material.userData.__baseDepthWrite as boolean));
        if ("wireframe" in material) {
          (material as THREE.Material & { wireframe: boolean }).wireframe =
            runtimeState.wireframe;
        }
        if (useClayShading && "color" in material) {
          (material as THREE.Material & { color: THREE.Color }).color.copy(
            effectiveClayColor
          );
        }
        dependencies.patchMaterialForProjection(material);
        setTileShadowMaterialReceiver(material, role?.receiver ?? true);
        material.needsUpdate = true;
      }
    });
  };

  const refreshRenderedMaterials: ThreeTilesRuntimeServices["refreshRenderedMaterials"] =
    (root: THREE.Object3D) => {
      applyMaterialFlags(root);
      runtimeState.mapStyleProjectionVersion += 1;
    };

  const applyOutlineVisibility: ThreeTilesRuntimeServices["applyOutlineVisibility"] =
    (root: THREE.Object3D) => {
      root.traverse((object) => {
        if (object.userData[TILE_OUTLINE_FLAG]) {
          object.visible = runtimeState.shadowSimulationStyle
            ? false
            : runtimeState.outlineVisible;
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
      if (!runtimeState.options.shadowBuildingStyle) return;
      if (shadowStylesEqual(runtimeState.shadowSimulationStyle, style)) return;
      runtimeState.shadowSimulationStyle = style;
      // Reapply one bounded cache policy when shadow mode changes. The shadow
      // camera may add off-screen casters, but it must not create a separate
      // download-admission ceiling or bypass the memory limit.
      dependencies.applyCacheBudget();
      if (style?.uniformColor)
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
