import { useEffect, useState } from "react";
import { useSelector } from "react-redux";
import {
  Cesium3DTileset,
  CustomShader,
  ShadowMode,
  viewerCesium3DTilesInspectorMixin,
} from "cesium";

import { useTweakpaneCtx } from "@carma-commons/debug";
import { TilesetConfig, TilesetType } from "@carma-commons/resources";
import { useCesiumContext } from "../hooks/useCesiumContext";
import {
  setShowPrimaryTileset,
  setShowSecondaryTileset,
  selectShowPrimaryTileset,
  selectShowSecondaryTileset,
  selectTilesetOpacity,
  selectViewerDataSources,
  selectViewerIsMode2d,
} from "../slices/cesium";

import { CUSTOM_SHADERS_DEFINITIONS, CustomShaderKeys as k } from "../shaders";
import { create3DTileStyle } from "../utils/cesiumHelpers";

import { useSecondaryStyleTilesetClickHandler } from "../hooks/useSecondaryStyleTilesetClickHandler";

import { TRANSITION_DELAY } from "../CustomViewer";
import { useCesiumViewer } from "../hooks/useCesiumViewer";

const defaultMaximumScreenSpaceError = 8; // 16 is default but quite Low Quality

const customShaderKeys = {
  clay: k.CLAY,
  "unlit 2020": k.UNLIT_ENHANCED_2020,
  "unlit 2024": k.UNLIT_ENHANCED_2024,
  unlit: k.UNLIT,
  "unlit fog": k.UNLIT_FOG,
  monochrome: k.MONOCHROME,
  undefined: k.UNDEFINED,
};

const debugTilesetUrls = {
  wupp2020: "https://wupp-3d-data.cismet.de/mesh/tileset.json",
  wupp2024: "https://wupp-3d-data.cismet.de/mesh2024/tileset.json",
};

const DEFAULT_MESH_SHADER_KEY = k.UNLIT_ENHANCED_2024;
const DEFAULT_MESH_SHADER = new CustomShader(
  CUSTOM_SHADERS_DEFINITIONS[DEFAULT_MESH_SHADER_KEY]
);

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
    CUSTOM_SHADERS_DEFINITIONS[DEFAULT_MESH_SHADER_KEY]
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

  const [showTileInspector, setShowTileInspector] = useState(false);
  const [customShaderKey, setCustomShaderKey] = useState(
    DEFAULT_MESH_SHADER_KEY
  );
  const [customMeshShader, setCustomMeshShader] = useState<
    undefined | CustomShader
  >(DEFAULT_MESH_SHADER);

  const [primaryTilesetUrl, setPrimaryTilesetUrl] = useState(
    tilesetConfigs.primary?.url ?? ""
  );

  const tilesetOpacity = useSelector(selectTilesetOpacity);
  const [enableDebugWireframe, setEnableDebugWireframe] = useState(false);

  const style = create3DTileStyle({
    color: `vec4(1.0, 1.0, 1.0, ${tilesetOpacity.toFixed(2)})`,
    show: true,
  });

  // SAMPLE for 3DTilesStyles
  /*
  const styleThematicLod2 = create3DTileStyle({
    //color: `vec4(0.5, 1.0, 1.0, ${tilesetOpacity.toFixed(2)})`,
    // eslint-disable-next-line no-template-curly-in-string
    color:
      '(${building_id} === "DENW29AL1000AzKQ")? color("orange") : color("grey")',
    show: true,
  });
  */
  const isMode2d = useSelector(selectViewerIsMode2d);
  const { folderCallback } = useTweakpaneCtx(
    {
      title: "Base Tilesets",
    },
    {
      get customShaderKey() {
        return customShaderKey;
      },
      set customShaderKey(v) {
        setCustomShaderKey(v);
        if (tilesetPrimary) {
          const def = CUSTOM_SHADERS_DEFINITIONS[customShaderKeys[v]];
          if (def === k.UNDEFINED) {
            setCustomMeshShader(undefined);
            tilesetPrimary.customShader = undefined;
          } else {
            const shader = new CustomShader(CUSTOM_SHADERS_DEFINITIONS[v]);
            tilesetPrimary.customShader = shader;
            setCustomMeshShader(shader);
          }
        }
      },
      get primaryTilesetUrl() {
        return primaryTilesetUrl;
      },
      set primaryTilesetUrl(v: string) {
        setPrimaryTilesetUrl(v);
      },
      get enableDebugWireframe() {
        return enableDebugWireframe;
      },
      set enableDebugWireframe(v: boolean) {
        if (v !== enableDebugWireframe) {
          setEnableDebugWireframe(v);
          Object.values(tilesetsRefs).map((tsRef) => {
            if (tsRef.current instanceof Cesium3DTileset)
              tsRef.current.debugWireframe = v;
          });
        }
      },
      get showPrimary() {
        return tilesetPrimary?.show ?? false;
      },
      set showPrimary(v: boolean) {
        setShowPrimaryTileset(v);
        if (tilesetPrimary) {
          tilesetPrimary.show = v;
        }
      },
      get showSecondary() {
        return tilesetSecondary?.show ?? false;
      },
      set showSecondary(v: boolean) {
        setShowSecondaryTileset(v);
        if (tilesetSecondary) {
          tilesetSecondary.show = v;
        }
      },
    },

    [
      { name: "customShaderKey", options: customShaderKeys },
      {
        name: "primaryTilesetUrl",
        options: {
          default: tilesetConfigs.primary?.url ?? "",
          ...debugTilesetUrls,
        },
      },
      { name: "enableDebugWireframe" },
      { name: "showPrimary" },
      { name: "showSecondary" },
    ]
  );

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
    folderCallback &&
      folderCallback((folder) => {
        if (!showTileInspector) {
          // TILE INSPECTOR MIXIN cant be removed once added

          const button = folder.addButton({
            title: "Show Tile Inspector",
          });
          button.on("click", () => {
            if (viewer) {
              viewer.extend(viewerCesium3DTilesInspectorMixin);
              setShowTileInspector(true);
            }
          });
        }
      });
  }, [folderCallback, viewer, showTileInspector]);

  /*
  useEffect(() => {
    if (viewer) {
      viewer.scene.light.intensity = 2.0;
      viewer.scene.fog.enabled = false;
    }
  }, [viewer]);
  */

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
