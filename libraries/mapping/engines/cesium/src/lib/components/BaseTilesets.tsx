import { useEffect, useState } from "react";
import { useSelector } from "react-redux";

import {
  viewerCesium3DTilesInspectorMixin,
} from "cesium";

import { useTweakpaneCtx } from "@carma-commons/debug";

import { useCesiumContext } from "../hooks/useCesiumContext";
import {
  setShowPrimaryTileset,
  setShowSecondaryTileset,
  selectShowPrimaryTileset,
  selectShowSecondaryTileset,
  selectTilesetOpacity,
  selectViewerIsMode2d,
} from "../slices/cesium";

import { create3DTileStyle } from "../utils/cesiumHelpers";

import { useSecondaryStyleTilesetClickHandler } from "../hooks/useSecondaryStyleTilesetClickHandler";

import { TRANSITION_DELAY } from "../CustomViewer";

let enableDebugWireframe = false;
const defaultMaximumScreenSpaceError = 8; // 16 is default but quite Low Quality

export const BaseTilesets = () => {
  const showPrimary = useSelector(selectShowPrimaryTileset);
  const { viewer,
    tilesets,
    tilesetPrimary,
    tilesetSecondary,
    setTilesetPrimary,
    setTilesetSecondary,
    tilesetPrimaryShader,
    tilesetSecondaryShader,
    setTilesetPrimaryShader,
    setTilesetSecondaryShader,
  } =
    useCesiumContext();
  const showSecondary = useSelector(selectShowSecondaryTileset);

  const [showTileInspector, setShowTileInspector] = useState(false);

  const [maximumScreenSpaceErrorPrimary, setMaximumScreenSpaceErrorPrimary] =
    useState(
      tilesetPrimary?.maximumScreenSpaceError ??
      defaultMaximumScreenSpaceError,
    );
  const [
    maximumScreenSpaceErrorSecondary,
    setMaximumScreenSpaceErrorSecondary,
  ] = useState(
    tilesetSecondary?.maximumScreenSpaceError ??
    defaultMaximumScreenSpaceError,
  );

  const tilesetOpacity = useSelector(selectTilesetOpacity);

  const style = create3DTileStyle({
    color: `vec4(1.0, 1.0, 1.0, ${tilesetOpacity.toFixed(2)})`,
    show: true,
  });

  const isMode2d = useSelector(selectViewerIsMode2d);
  const { folderCallback } = useTweakpaneCtx(
    {
      title: "Base Tilesets",
    }, {
    get enableDebugWireframe() {
      return enableDebugWireframe;
    },
    set enableDebugWireframe(v: boolean) {
      enableDebugWireframe = v;
      if (tilesetPrimary) {
        tilesetPrimary.debugWireframe = v;
      }
      if (tilesetSecondary) {
        tilesetSecondary.debugWireframe = v;
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
    get maximumScreenSpaceErrorPrimary() {
      return maximumScreenSpaceErrorPrimary;
    },
    set maximumScreenSpaceErrorPrimary(v: number) {
      setMaximumScreenSpaceErrorPrimary(v);
      if (tilesetPrimary) {
        tilesetPrimary.maximumScreenSpaceError = v;
      }
    },
    get maximumScreenSpaceErrorSecondary() {
      return maximumScreenSpaceErrorSecondary;
    },
    set maximumScreenSpaceErrorSecondary(v: number) {
      setMaximumScreenSpaceErrorSecondary(v);
      if (tilesetSecondary) {
        tilesetSecondary.maximumScreenSpaceError = v;
      }
    },
  },
    [
      { name: "enableDebugWireframe" },
      { name: "showPrimary" },
      { name: "showSecondary" },
      { name: "maximumScreenSpaceErrorPrimary", min: 1, max: 16, step: 1 },
      { name: "maximumScreenSpaceErrorSecondary", min: 1, max: 16, step: 1 },
    ],
  );

  useEffect(() => {
    console.log("HOOK BaseTilesets: showPrimary", showPrimary);
    if (tilesetPrimary) {
      // workaround to toggle tileset visibility,
      // resium does not seem to forward the show prop after first initialization
      tilesetPrimary.show = showPrimary;
    }
    if (tilesetSecondary) {
      // workaround to toggle tileset visibility,
      // resium does not seem to forward the show prop after first initialization
      tilesetSecondary.show = showSecondary;
    }
  }, [showPrimary, tilesetPrimary, showSecondary, tilesetSecondary]);

  useSecondaryStyleTilesetClickHandler();

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
      console.log("HOOK: no viewer");
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
    if (tilesetPrimary && viewer) {
      console.log("HOOK:Primary Tileset added to scene:", tilesetPrimary);
      viewer.scene.primitives.add(tilesetPrimary);
      return () => {
        if (viewer && tilesetPrimary) {
          console.log("HOOK:Primary Tileset removed from scene:", tilesetPrimary);
          tilesetPrimary && viewer.scene.primitives.remove(tilesetPrimary);
        }
      };
    }
    return;
  }, [tilesetPrimary, viewer]);

  useEffect(() => {
    if (tilesetSecondary && viewer) {
      console.log("HOOK:Secondary Tileset added to scene:", tilesetSecondary);
      viewer.scene.primitives.add(tilesetSecondary);
      return () => {
        if (viewer && tilesetSecondary) {
          console.log("HOOK:Secondary Tileset removed from scene:", tilesetSecondary);
          viewer.scene.primitives.remove(tilesetSecondary);
        }
      };
    }
    return;
  }, [tilesetSecondary, viewer]);


  console.log("HOOK: RenderBaseTilesets", tilesetPrimary, tilesetSecondary);

  return null;

  /*
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
  */
};
