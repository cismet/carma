import { useEffect, useState } from "react";
import { useSelector } from "react-redux";

import { Cesium3DTileset as Resium3DTileset } from "resium";

import {
  Cesium3DTileset,
  CustomShader,
  ShadowMode,
  viewerCesium3DTilesInspectorMixin,
} from "cesium";

import { useTweakpaneCtx } from "@carma-commons/debug";

import { useCesiumContext } from "../CesiumContextProvider";
import {
  setShowPrimaryTileset,
  setShowSecondaryTileset,
  selectShowPrimaryTileset,
  selectShowSecondaryTileset,
  selectTilesetOpacity,
  selectViewerDataSources,
  selectViewerIsMode2d,
} from "../slices/cesium";

import {
  CUSTOM_SHADERS_DEFINITIONS,
  CustomShaderKeys as k,
} from "../shaders";
import { create3DTileStyle } from "../utils/cesiumHelpers";

import { useSecondaryStyleTilesetClickHandler } from "../hooks/useSecondaryStyleTilesetClickHandler";

import { TRANSITION_DELAY } from "../CustomViewer";

let enableDebugWireframe = false;
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
  CUSTOM_SHADERS_DEFINITIONS[DEFAULT_MESH_SHADER_KEY],
);

export const BaseTilesets = () => {
  const tilesetConfigs = useSelector(selectViewerDataSources).tilesets;
  const showPrimary = useSelector(selectShowPrimaryTileset);
  const { viewer, tilesets, setPrimaryTileset, setSecondaryTileset } = useCesiumContext();
  const showSecondary = useSelector(selectShowSecondaryTileset);

  const [showTileInspector, setShowTileInspector] = useState(false);
  const [customShaderKey, setCustomShaderKey] = useState(
    DEFAULT_MESH_SHADER_KEY,
  );
  const [customMeshShader, setCustomMeshShader] = useState<
    undefined | CustomShader
  >(DEFAULT_MESH_SHADER);
  const [maximumScreenSpaceErrorPrimary, setMaximumScreenSpaceErrorPrimary] = useState(
    tilesetConfigs.primary?.maximumScreenSpaceError ?? defaultMaximumScreenSpaceError
  );
  const [maximumScreenSpaceErrorSecondary, setMaximumScreenSpaceErrorSecondary] = useState(
    tilesetConfigs.secondary?.maximumScreenSpaceError ?? defaultMaximumScreenSpaceError
  );

  const [primaryTilesetUrl, setPrimaryTilesetUrl] = useState(
    tilesetConfigs.primary?.url ?? ""
  );

  const tilesetOpacity = useSelector(selectTilesetOpacity);

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
        if (tilesets.primary) {
          const def = CUSTOM_SHADERS_DEFINITIONS[customShaderKeys[v]];
          if (def === k.UNDEFINED) {
            setCustomMeshShader(undefined);
            tilesets.primary.customShader = undefined;
          } else {
            const shader = new CustomShader(CUSTOM_SHADERS_DEFINITIONS[v]);
            tilesets.primary.customShader = shader;
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
        enableDebugWireframe = v;
        (Object.entries(tilesets)).map(ts => { if (ts instanceof Cesium3DTileset) ts.debugWireframe = v })
      },
      get showPrimary() {
        return tilesets.primary?.show ?? false;
      },
      set showPrimary(v: boolean) {
        setShowPrimaryTileset(v);
        if (tilesets.primary) {
          tilesets.primary.show = v;
        }
      },
      get showSecondary() {
        return tilesets.secondary?.show ?? false;
      },
      set showSecondary(v: boolean) {
        setShowSecondaryTileset(v);
        if (tilesets.secondary) {
          tilesets.secondary.show = v;
        }
      },
      get maximumScreenSpaceErrorPrimary() {
        return maximumScreenSpaceErrorPrimary;
      },
      set maximumScreenSpaceErrorPrimary(v: number) {
        setMaximumScreenSpaceErrorPrimary(v);
        if (tilesets.primary) {
          tilesets.primary.maximumScreenSpaceError = v;
        }
      },
      get maximumScreenSpaceErrorSecondary() {
        return maximumScreenSpaceErrorSecondary;
      },
      set maximumScreenSpaceErrorSecondary(v: number) {
        setMaximumScreenSpaceErrorSecondary(v);
        if (tilesets.secondary) {
          tilesets.secondary.maximumScreenSpaceError = v;
        }
      },
    },

    [
      { name: "customShaderKey", options: customShaderKeys },
      { name: "primaryTilesetUrl", options: { default: tilesetConfigs.primary?.url ?? "", ...debugTilesetUrls } },
      { name: "enableDebugWireframe" },
      { name: "showPrimary" },
      { name: "showSecondary" },
      { name: "maximumScreenSpaceErrorPrimary", min: 1, max: 16, step: 1 },
      { name: "maximumScreenSpaceErrorSecondary", min: 1, max: 16, step: 1 },
    ],
  );

  useEffect(() => {
    console.log("HOOK BaseTilesets: showPrimary", showPrimary);
    if (tilesets.primary) {
      // workaround to toggle tileset visibility,
      // resium does not seem to forward the show prop after first initialization
      tilesets.primary.show = showPrimary;
    }
    if (tilesets.secondary) {
      // workaround to toggle tileset visibility,
      // resium does not seem to forward the show prop after first initialization
      tilesets.secondary.show = showSecondary;
    }
  }, [showPrimary, tilesets.primary, showSecondary, tilesets.secondary]);

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

  useEffect(() => {
    if (viewer) {
      viewer.scene.light.intensity = 2.0;
      viewer.scene.fog.enabled = false;
    }
  }, [viewer]);

  useEffect(() => {
    const hideTilesets = () => {
      // render offscreen with ultra low res to reduce memory usage
      console.log("HOOK: hide tilesets in 2d");
      if (tilesets.primary) { tilesets.primary.show = false; }
      if (tilesets.secondary) { tilesets.secondary.show = false; }
    }
    if (viewer) {
      if (isMode2d) {
        setTimeout(() => { hideTilesets(); }, TRANSITION_DELAY);
      } else {
        if (tilesets.primary) { tilesets.primary.show = showPrimary; }
        if (tilesets.secondary) { tilesets.secondary.show = showSecondary; }
      }
    } else {
      console.log("HOOK: no viewer");
      hideTilesets();
    }
  }, [isMode2d, viewer, showPrimary, showSecondary, tilesets.primary, tilesets.secondary]);

  return (
    <>
      <Resium3DTileset
        key={primaryTilesetUrl}
        show={showPrimary}
        customShader={customMeshShader}
        enableDebugWireframe={enableDebugWireframe}
        // quality
        //cacheBytes={536870912 * 2}
        shadows={ShadowMode.DISABLED}
        dynamicScreenSpaceError={false}
        //baseScreenSpaceError={256}
        maximumScreenSpaceError={maximumScreenSpaceErrorPrimary}
        foveatedScreenSpaceError={true}
        foveatedConeSize={0.2}
        skipScreenSpaceErrorFactor={4}
        skipLevelOfDetail={true}
        //immediatelyLoadDesiredLevelOfDetail={true}
        url={primaryTilesetUrl}
        style={style}
        enableCollision={false}
        preloadWhenHidden={false}
        onReady={(ts) => setPrimaryTileset && setPrimaryTileset(ts)}
      />
      <Resium3DTileset
        show={showSecondary}
        enableDebugWireframe={enableDebugWireframe}
        // quality
        dynamicScreenSpaceError={false}
        maximumScreenSpaceError={maximumScreenSpaceErrorSecondary}
        foveatedScreenSpaceError={true}
        //skipScreenSpaceErrorFactor={4}
        //skipLevelOfDetail={true}
        //immediatelyLoadDesiredLevelOfDetail={true}

        url={tilesetConfigs.secondary?.url ?? ""}
        style={style}
        //style={styleThematicLod2}

        enableCollision={false}
        preloadWhenHidden={true}
        onReady={(tileset) => setSecondaryTileset(tileset)}
      />
    </>
  );
};
