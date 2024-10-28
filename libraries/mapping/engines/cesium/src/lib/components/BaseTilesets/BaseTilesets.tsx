import { useEffect } from "react";
import { useSelector } from "react-redux";
import { Cesium3DTileset, CustomShader } from "cesium";

import { TilesetConfig, TilesetType } from "@carma-commons/resources";

import {
  selectShowPrimaryTileset,
  selectShowSecondaryTileset,
  selectViewerDataSources,
  selectViewerIsMode2d,
} from "../../slices/cesium";

import { CUSTOM_SHADERS_DEFINITIONS, CustomShaderKeys } from "../../shaders";

import { useCesiumContext } from "../../hooks/useCesiumContext";
import { useCesiumViewer } from "../../hooks/useCesiumViewer";
import { useSecondaryStyleTilesetClickHandler } from "../../hooks/useSecondaryStyleTilesetClickHandler";

import { TRANSITION_DELAY } from "../../CustomViewer";

import { useBaseTilesetsTweakpane } from "./hooks/useBaseTilesetsTweakpane";

const DEFAULT_MESH_OPTIONS: Cesium3DTileset.ConstructorOptions = {
  maximumScreenSpaceError: 8,
  dynamicScreenSpaceError: false,
  foveatedScreenSpaceError: true,
  foveatedConeSize: 0.2,
  preloadWhenHidden: false,
};

const DEFAULT_LOD2_OPTIONS: Cesium3DTileset.ConstructorOptions = {
  maximumScreenSpaceError: 1,
  dynamicScreenSpaceError: false,
  foveatedScreenSpaceError: true,
  preloadWhenHidden: true,
};

const loadLOD2Tileset = async (tileset: TilesetConfig) => {
  const lod2 = await Cesium3DTileset.fromUrl(tileset.url, {
    ...tileset.constructorOptions,
    ...DEFAULT_LOD2_OPTIONS,
  });
  return lod2;
};

const loadMeshTileset = async (tileset: TilesetConfig) => {
  // TODO get shader from tileset config
  const shader = new CustomShader(
    CUSTOM_SHADERS_DEFINITIONS[CustomShaderKeys.UNLIT_ENHANCED_2024]
  );
  const mesh = await Cesium3DTileset.fromUrl(tileset.url, {
    ...tileset.constructorOptions,
    ...DEFAULT_MESH_OPTIONS,
  });
  mesh.customShader = shader;
  return mesh;
};

const loadTileset = async (tileset: TilesetConfig) => {
  if (tileset.type === TilesetType.LOD2) {
    return await loadLOD2Tileset(tileset);
  } else if (tileset.type === TilesetType.MESH) {
    return await loadMeshTileset(tileset);
  } else {
    throw new Error(`Unknown tileset type: ${tileset.type}`);
  }
};

export const BaseTilesets = () => {
  const tilesetConfigs = useSelector(selectViewerDataSources).tilesets;
  const showPrimary = useSelector(selectShowPrimaryTileset);
  const { tilesetsRefs } = useCesiumContext();
  const viewer = useCesiumViewer();
  let tilesetPrimary = tilesetsRefs.primaryRef.current;
  let tilesetSecondary = tilesetsRefs.secondaryRef.current;
  const showSecondary = useSelector(selectShowSecondaryTileset);

  // SAMPLE for 3DTilesStyles
  /*
  const style = create3DTileStyle({
    color: `vec4(1.0, 1.0, 1.0, ${tilesetOpacity.toFixed(2)})`,
    show: true,
  });

  const styleThematicLod2 = create3DTileStyle({
    //color: `vec4(0.5, 1.0, 1.0, ${tilesetOpacity.toFixed(2)})`,
    // eslint-disable-next-line no-template-curly-in-string
    color:
      '(${building_id} === "DENW29AL1000AzKQ")? color("orange") : color("grey")',
    show: true,
  });
  */
  const isMode2d = useSelector(selectViewerIsMode2d);
  useBaseTilesetsTweakpane();

  useEffect(() => {
    console.debug("HOOK BaseTilesets: showSecondary", showSecondary);
    if (tilesetSecondary) {
      tilesetSecondary.show = showSecondary;
    }
  }, [showSecondary, tilesetSecondary]);

  useEffect(() => {
    console.debug("HOOK BaseTilesets: showPrimary", showPrimary);
    if (tilesetPrimary) {
      tilesetPrimary.show = showPrimary;
    }
  }, [showPrimary, tilesetPrimary]);

  useSecondaryStyleTilesetClickHandler(tilesetConfigs.secondary);

  useEffect(() => {
    const hideTilesets = () => {
      // render offscreen with ultra low res to reduce memory usage
      console.debug("HOOK: hide tilesets in 2d");
      if (tilesetPrimary) {
        tilesetPrimary.show = false;
      }
      if (tilesetSecondary) {
        tilesetSecondary.show = false;
      }
    };
    if (viewer) {
      if (isMode2d) {
        setTimeout(() => {
          hideTilesets();
        }, TRANSITION_DELAY);
      } else {
        if (tilesetPrimary) {
          tilesetPrimary.show = showPrimary;
        }
        if (tilesetSecondary) {
          tilesetSecondary.show = showSecondary;
        }
      }
    } else {
      console.debug("HOOK: no viewer");
      hideTilesets();
    }
  }, [
    isMode2d,
    viewer,
    showPrimary,
    showSecondary,
    tilesetPrimary,
    tilesetSecondary,
  ]);

  useEffect(() => {
    if (viewer && tilesetConfigs.secondary) {
      const fetchSecondary = async () => {
        tilesetsRefs.secondaryRef.current = await loadTileset(
          tilesetConfigs.secondary!
        );
        viewer.scene.primitives.add(tilesetsRefs.secondaryRef.current);
      };
      fetchSecondary().catch(console.error);
    }
    return () => {
      if (viewer && tilesetsRefs.secondaryRef.current) {
        viewer.scene.primitives.remove(tilesetsRefs.secondaryRef.current);
        tilesetsRefs.secondaryRef.current.destroy();
        tilesetsRefs.secondaryRef.current = null;
      }
    };
  }, [
    viewer,
    tilesetConfigs,
    tilesetsRefs.secondaryRef,
    tilesetConfigs.secondary,
  ]);

  useEffect(() => {
    if (viewer && tilesetConfigs.primary) {
      const fetchPrimary = async () => {
        tilesetsRefs.primaryRef.current = await loadTileset(
          tilesetConfigs.primary!
        );
        viewer.scene.primitives.add(tilesetsRefs.primaryRef.current);
      };
      fetchPrimary().catch(console.error);
    }

    return () => {
      if (viewer && tilesetsRefs.primaryRef.current) {
        viewer.scene.primitives.remove(tilesetsRefs.primaryRef.current);
        tilesetsRefs.primaryRef.current.destroy();
        tilesetsRefs.primaryRef.current = null;
      }
    };
  }, [viewer, tilesetConfigs, tilesetsRefs.primaryRef]);

  return null;
};
