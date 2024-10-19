import { useEffect, useState } from "react";
import type { ReactNode } from "react";

import {
  CesiumTerrainProvider,
  EllipsoidTerrainProvider,
  ImageryLayer,
  WebMapServiceImageryProvider,
  Viewer,
  Cesium3DTileset,
  CustomShader,
} from "cesium";

import { CustomShaderDefinition } from "types/cesium-config";

import { TilesetConfig } from "./utils/cesiumHelpers";
import { CesiumContext, type CesiumContextType } from "./CesiumContext";

interface CesiumContextProviderProps {
  children: ReactNode;
  tilesetConfig: {
    primary: TilesetConfig;
    secondary: TilesetConfig;
    [key: string]: TilesetConfig;
  };
  providerConfig: {
    surfaceProvider?: {
      url: string;
    };
    terrainProvider: {
      url: string;
    };
    imageryProvider: {
      url: string;
      layers: string;
      parameters?: Record<string, string | number | boolean>;
    };
  };
  shaderDefinitions: Record<string, CustomShaderDefinition>;
}

export const CesiumContextProvider = ({
  children,
  providerConfig,
  shaderDefinitions,
  tilesetConfig,
}: CesiumContextProviderProps) => {
  const [viewer, setViewer] = useState<Viewer | null>(null);
  const [tilesets, setTilesets] = useState<[string, Cesium3DTileset][]>([]);
  const [tilesetPrimary, setTilesetPrimary] = useState<Cesium3DTileset | null>(
    null,
  );
  const [tilesetSecondary, setTilesetSecondary] = useState<Cesium3DTileset | null>(
    null,
  );
  const [tilesetPrimaryShader, setTilesetPrimaryShader] = useState<CustomShader | null>(null);
  const [tilesetSecondaryShader, setTilesetSecondaryShader] = useState<CustomShader | null>(null);

  const [terrainProvider, setTerrainProvider] =
    useState<CesiumTerrainProvider | null>(null);
  const [surfaceProvider, setSurfaceProvider] =
    useState<CesiumTerrainProvider | null>(null);

  const imageryProvider = new WebMapServiceImageryProvider(
    providerConfig.imageryProvider,
  );

  // Load tilesets and shaders
  useEffect(() => {
    (async () => {
      const { primary, secondary, ...rest } = tilesetConfig;

      let parsedTilesets: [string, Cesium3DTileset][] = [];

      try {
        const parsedPrimary = await Cesium3DTileset.fromUrl(primary.url);
        setTilesetPrimary(parsedPrimary);
        if (primary.shader) {
          const shaderPrimary = new CustomShader(primary.shader);
          setTilesetPrimaryShader(shaderPrimary);
          parsedPrimary.customShader = shaderPrimary;
        }
        parsedTilesets.push(["defaultPrimary", parsedPrimary]);
      } catch (error) {
        console.error("Failed to load primary tileset:", error);
      }
      try {
        const parsedSecondary = await Cesium3DTileset.fromUrl(secondary.url);
        setTilesetSecondary(parsedSecondary);
        if (secondary.shader && parsedSecondary) {
          const shaderSecondary = new CustomShader(secondary.shader);
          setTilesetSecondaryShader(shaderSecondary);
          parsedSecondary.customShader = shaderSecondary;
        }
        parsedTilesets.push(["defaultSecondary", parsedSecondary]);
      } catch (error) {
        console.error("Failed to load secondary tileset:", error);
      }

      try {
        for (const [key, tileset] of Object.entries(rest)) {
          const parsedTileset = await Cesium3DTileset.fromUrl(tileset.url);
          parsedTilesets.push([key, parsedTileset]);
        }

      } catch (error) {
        console.warn("Failed to load rest of tilesets:", error);
      }

      setTilesets(parsedTilesets);
      console.log("Loaded Tilesets", parsedTilesets);
    })()
  }, [tilesetConfig, shaderDefinitions]);


  useEffect(() => {
    (async () => {
      try {
        setTerrainProvider(
          await CesiumTerrainProvider.fromUrl(
            providerConfig.terrainProvider.url,
          ),
        );
      } catch (error) {
        console.error("Failed to load terrain provider:", error);
      }
    })();
  }, [providerConfig.terrainProvider.url]);

  useEffect(() => {
    (async () => {
      try {
        providerConfig.surfaceProvider &&
          setSurfaceProvider(
            await CesiumTerrainProvider.fromUrl(
              providerConfig.surfaceProvider.url,
            ),
          );
      } catch (error) {
        console.error("Failed to load terrain provider:", error);
      }
    })();
  }, [providerConfig.surfaceProvider]);


  const values: CesiumContextType = {
    viewer,
    setViewer,
    ellipsoidTerrainProvider: new EllipsoidTerrainProvider(),
    terrainProvider,
    surfaceProvider,
    imageryLayer: new ImageryLayer(imageryProvider),
    tilesets,
    tilesetPrimary,
    tilesetSecondary,
    tilesetPrimaryShader,
    tilesetSecondaryShader,
    setTilesetPrimary,
    setTilesetSecondary,
    setTilesetPrimaryShader,
    setTilesetSecondaryShader,
    shaderDefinitions,
  };

  console.log("RENDER:Cesium CustomViewerContextProvider Initialized", values);

  return (
    <CesiumContext.Provider value={values}>{children}</CesiumContext.Provider>
  );
};

export default CesiumContextProvider;
