import React, { useEffect, useState } from 'react';
import { Cesium3DTileset as Resium3DTileset, useCesium } from 'resium';
import {
  setShowPrimaryTileset,
  setShowSecondaryTileset,
  useShowPrimaryTileset,
  useShowSecondaryTileset,
  useTilesetOpacity,
  useViewerDataSources,
} from '../../../store/slices/viewer';
import { create3DTileStyle } from '../../../utils/cesiumHelpers';
import {
  Cesium3DTileset,
  CustomShader,
  ShadowMode,
  viewerCesium3DTilesInspectorMixin,
} from 'cesium';
import { useSecondaryStyleTilesetClickHandler } from '../../../hooks';
import { useTweakpaneCtx } from '@carma-commons/debug';
import {
  CUSTOM_SHADERS_DEFINITIONS,
  CustomShaderKeys,
} from '../../../utils/cesiumShaders';

const preloadWhenHidden = true;
let enableDebugWireframe = false;
let maximumScreenSpaceError = 4; // 16 is default but quite Low Quality

const customShaderKeys = {
  clay: CustomShaderKeys.CLAY,
  'unlit enhanced': CustomShaderKeys.UNLIT,
  unlit: CustomShaderKeys.UNLIT_BASE,
  'unlit fog': CustomShaderKeys.UNLIT_FOG,
  monochrome: CustomShaderKeys.MONOCHROME,
  undefined: CustomShaderKeys.UNDEFINED,
};

const DEFAULT_MESH_SHADER_KEY = CustomShaderKeys.UNLIT;
const DEFAULT_MESH_SHADER = new CustomShader(
  CUSTOM_SHADERS_DEFINITIONS[DEFAULT_MESH_SHADER_KEY]
);

export const BaseTilesets = () => {
  const tilesets = useViewerDataSources().tilesets;
  const showPrimary = useShowPrimaryTileset();
  const { viewer } = useCesium();
  const showSecondary = useShowSecondaryTileset();
  const [tsA, setTsA] = React.useState<Cesium3DTileset | null>(null);
  const [tsB, setTsB] = React.useState<Cesium3DTileset | null>(null);
  const [showTileInspector, setShowTileInspector] = useState(false);
  const [customShaderKey, setCustomShaderKey] = useState(
    DEFAULT_MESH_SHADER_KEY
  );
  const [customMeshShader, setCustomMeshShader] = useState<
    undefined | CustomShader
  >(DEFAULT_MESH_SHADER);

  const tilesetOpacity = useTilesetOpacity();

  const style = create3DTileStyle({
    color: `vec4(1.0, 1.0, 1.0, ${tilesetOpacity.toFixed(2)})`,
    show: true,
  });

  const { folderCallback } = useTweakpaneCtx(
    {
      title: 'Base Tilesets',
    },
    {
      get customShaderKey() {
        return customShaderKey;
      },
      set customShaderKey(v) {
        setCustomShaderKey(v);
        if (tsA) {
          const def = CUSTOM_SHADERS_DEFINITIONS[customShaderKeys[v]];
          if (def === CustomShaderKeys.UNDEFINED) {
            setCustomMeshShader(undefined);
            tsA.customShader = undefined;
          } else {
            const shader = new CustomShader(CUSTOM_SHADERS_DEFINITIONS[v]);
            tsA.customShader = shader;
            setCustomMeshShader(shader);
          }
        }
      },

      get enableDebugWireframe() {
        return enableDebugWireframe;
      },
      set enableDebugWireframe(v: boolean) {
        enableDebugWireframe = v;
        if (tsA) {
          tsA.debugWireframe = v;
        }
        if (tsB) {
          tsB.debugWireframe = v;
        }
      },
      get showPrimary() {
        return tsA?.show ?? false;
      },
      set showPrimary(v: boolean) {
        setShowPrimaryTileset(v);
        if (tsA) {
          tsA.show = v;
        }
      },
      get showSecondary() {
        return tsB?.show ?? false;
      },
      set showSecondary(v: boolean) {
        setShowSecondaryTileset(v);
        if (tsB) {
          tsB.show = v;
        }
      },
      get maximumScreenSpaceError() {
        return maximumScreenSpaceError;
      },
      set maximumScreenSpaceError(v: number) {
        maximumScreenSpaceError = v;

        if (tsA) {
          tsA.maximumScreenSpaceError = v;
        }
        if (tsB) {
          tsB.maximumScreenSpaceError = v;
        }
      },
    },

    [
      { name: 'customShaderKey', options: customShaderKeys },
      { name: 'enableDebugWireframe' },
      { name: 'showPrimary' },
      { name: 'showSecondary' },
      { name: 'maximumScreenSpaceError', min: 0.1, max: 64 },
    ]
  );

  useEffect(() => {
    console.log('HOOK BaseTilesets: showPrimary', showPrimary);
    if (tsA) {
      // workaround to toggle tileset visibility,
      // resium does not seem to forward the show prop after first initialization
      tsA.show = showPrimary;
    }
    if (tsB) {
      // workaround to toggle tileset visibility,
      // resium does not seem to forward the show prop after first initialization
      tsB.show = showSecondary;
    }
  }, [showPrimary, tsA, showSecondary, tsB]);

  useSecondaryStyleTilesetClickHandler();

  useEffect(() => {
    folderCallback &&
      folderCallback((folder) => {
        if (!showTileInspector) {
          // TILE INSPECTOR MIXIN cant be removed once added

          const button = folder.addButton({
            title: 'Show Tile Inspector',
          });
          button.on('click', () => {
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

  return (
    <>
      <Resium3DTileset
        show={showPrimary}
        customShader={customMeshShader}
        enableDebugWireframe={enableDebugWireframe}
        // quality
        cacheBytes={536870912 * 2}
        shadows={ShadowMode.DISABLED}
        dynamicScreenSpaceError={false}
        baseScreenSpaceError={256}
        maximumScreenSpaceError={maximumScreenSpaceError}
        foveatedScreenSpaceError={false}
        skipScreenSpaceErrorFactor={8}
        skipLevelOfDetail={true}
        //immediatelyLoadDesiredLevelOfDetail={true}

        url={tilesets.primary.url}
        style={style}
        enableCollision={false}
        preloadWhenHidden={preloadWhenHidden}
        onReady={(tileset) => setTsA(tileset)}
      />
      <Resium3DTileset
        show={showSecondary}
        enableDebugWireframe={enableDebugWireframe}
        // quality
        dynamicScreenSpaceError={false}
        maximumScreenSpaceError={maximumScreenSpaceError}
        foveatedScreenSpaceError={false}
        skipScreenSpaceErrorFactor={4}
        skipLevelOfDetail={true}
        //immediatelyLoadDesiredLevelOfDetail={true}

        url={tilesets.secondary.url}
        style={style}
        enableCollision={false}
        preloadWhenHidden={preloadWhenHidden}
        onReady={(tileset) => setTsB(tileset)}
      />
    </>
  );
};
