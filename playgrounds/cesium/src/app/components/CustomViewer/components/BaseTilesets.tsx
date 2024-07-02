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
import { Cesium3DTileset, viewerCesium3DTilesInspectorMixin } from 'cesium';
import { useSecondaryStyleTilesetClickHandler } from '../../../hooks';
import { useTweakpaneCtx } from '@carma/debug-ui';

const preloadWhenHidden = true;
let enableDebugWireframe = false;
let baseScreenSpaceError = 1024;

export const BaseTilesets = () => {
  const tilesets = useViewerDataSources().tilesets;
  const showPrimary = useShowPrimaryTileset();
  const { viewer } = useCesium();
  const showSecondary = useShowSecondaryTileset();
  const [tsA, setTsA] = React.useState<Cesium3DTileset | null>(null);
  const [tsB, setTsB] = React.useState<Cesium3DTileset | null>(null);
  const [showTileInspector, setShowTileInspector] = useState(false);

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
      get baseScreenSpaceError() {
        return baseScreenSpaceError;
      },
      set baseScreenSpaceError(v: number) {
        baseScreenSpaceError = v;

        if (tsA) {
          tsA.baseScreenSpaceError = v;
        }
        if (tsB) {
          tsB.baseScreenSpaceError = v;
        }
      },
    },

    [
      { name: 'enableDebugWireframe' },
      { name: 'showPrimary' },
      { name: 'showSecondary' },
      { name: 'baseScreenSpaceError', min: 1, max: 8048 },
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

  // TODO add the alternative planning style tileset here too for instant switching after first load

  return (
    <>
      <Resium3DTileset
        show={showPrimary}
        enableDebugWireframe={enableDebugWireframe}
        baseScreenSpaceError={baseScreenSpaceError}
        url={tilesets.primary.url}
        style={style}
        enableCollision={false}
        preloadWhenHidden={preloadWhenHidden}
        onReady={(tileset) => setTsA(tileset)}
      />
      <Resium3DTileset
        show={showSecondary}
        enableDebugWireframe={enableDebugWireframe}
        baseScreenSpaceError={baseScreenSpaceError}
        url={tilesets.secondary.url}
        style={style}
        enableCollision={false}
        preloadWhenHidden={preloadWhenHidden}
        onReady={(tileset) => setTsB(tileset)}
      />
    </>
  );
};
