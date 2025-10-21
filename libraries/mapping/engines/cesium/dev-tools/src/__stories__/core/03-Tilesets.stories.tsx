import type { Meta, StoryObj } from "@storybook/react";
import { useState, useEffect } from "react";
import { useControls, folder } from "leva";
import {
  CesiumContextProvider,
  useCesiumContext,
} from "@carma-mapping/engines/cesium/core";
import { CesiumStoryLayout } from "../../../.storybook/components/CesiumStoryLayout";
import { STORYBOOK_CESIUM_CONFIG } from "./storybook-cesium.config";
import { WUPP_MESH_2020, WUPP_MESH_2024 } from "@carma/resources";
import {
  createUnlitCustomShaderConstructorOptions,
  type CustomShaderConstructorOptions,
  type UnlitShaderUniforms,
} from "@carma-mapping/engines/cesium/shaders";
import {
  CustomShader,
  Cesium3DTileset,
  ShadowMode,
  Cesium3DTileColorBlendMode,
  Axis,
  Cartesian3,
} from "cesium";

// Built-in shader presets (inline since SHADER_PRESETS might not be available yet)
const BUILT_IN_SHADERS: Record<string, UnlitShaderUniforms> = {
  UNLIT: {
    gammaCorrection: [1.0, 1.0, 1.0],
    blackPoint: [0.0, 0.0, 0.0],
    whitePoint: [1.0, 1.0, 1.0],
    saturation: 1.0,
  },
  MONOCHROME: {
    gammaCorrection: [1.0, 1.0, 1.25],
    blackPoint: [-0.1, -0.1, -0.1],
    whitePoint: [0.9, 0.9, 0.9],
    saturation: 0.0,
  },
  ENHANCED_BRIGHT: {
    gammaCorrection: [1.3, 1.3, 1.25],
    blackPoint: [0.0, 0.0, 0.0],
    whitePoint: [0.95, 0.95, 0.95],
    saturation: 1.1,
  },
};

// Wrapper component for stories
function CesiumContextWrapper({ children }: { children: React.ReactNode }) {
  return (
    <CesiumContextProvider config={STORYBOOK_CESIUM_CONFIG}>
      {children}
    </CesiumContextProvider>
  );
}

const meta: Meta = {
  title: "mapping\\engines\\cesium/core",
  decorators: [
    (Story) => (
      <CesiumContextWrapper>
        <Story />
      </CesiumContextWrapper>
    ),
  ],
};

export default meta;

type Story = StoryObj;

// Shader preset names
const SHADER_PRESET_NAMES = Object.keys(BUILT_IN_SHADERS);

// Local type for tileset resource (simplified)
type TilesetResourceConfig = {
  url: string;
  [key: string]: any;
};

type TilesetWithShader = {
  resource: TilesetResourceConfig;
  tileset?: Cesium3DTileset;
};

/* Disabled - WIP
function TilesetShaderDemo() {
  const ctx = useCesiumContext();
  const [activeTileset, setActiveTileset] = useState<"mesh2020" | "mesh2024">(
    "mesh2024"
  );
  const [loadedTileset, setLoadedTileset] = useState<Cesium3DTileset | null>(
    null
  );

  // Tileset selection
  const { selectedTileset } = useControls("Tileset", {
    selectedTileset: {
      value: "mesh2024",
      options: {
        "Mesh 2024": "mesh2024",
        "Mesh 2020": "mesh2020",
      },
      label: "Active Tileset",
      onChange: (value: "mesh2020" | "mesh2024") => setActiveTileset(value),
    },
  });

  // Leva controls for TilesetStyle options
  const styleControls = useControls("Style", {
    "Shader Preset": {
      value: "DEFAULT",
      options: ["DEFAULT", ...SHADER_PRESET_NAMES],
    },

    "Visual Style": folder({
      show: { value: true, label: "Show" },
      opacity: { value: 1.0, min: 0, max: 1, step: 0.01, label: "Opacity" },

      colorBlendMode: {
        value: "HIGHLIGHT",
        options: ["HIGHLIGHT", "REPLACE", "MIX"],
        label: "Color Blend Mode",
      },
    }),

    Quality: folder({
      maximumScreenSpaceError: {
        value: 16,
        min: 1,
        max: 128,
        step: 1,
        label: "Max Screen Space Error",
      },
      backFaceCulling: { value: true, label: "Back Face Culling" },
    }),

    Lighting: folder({
      shadows: {
        value: ShadowMode.ENABLED,
        options: {
          Enabled: ShadowMode.ENABLED,
          Disabled: ShadowMode.DISABLED,
          "Cast Only": ShadowMode.CAST_ONLY,
          "Receive Only": ShadowMode.RECEIVE_ONLY,
        },
        label: "Shadows",
      },
      lightColor: {
        value: { r: 255, g: 255, b: 255 },
        label: "Light Color",
      },
    }),

    "Constructor Options (Immutable)": folder({
      modelUpAxis: {
        value: Axis.Y,
        options: { X: Axis.X, Y: Axis.Y, Z: Axis.Z },
        label: "Model Up Axis",
      },
      modelForwardAxis: {
        value: Axis.X,
        options: { X: Axis.X, Y: Axis.Y, Z: Axis.Z },
        label: "Model Forward Axis",
      },
      cullWithChildrenBounds: {
        value: true,
        label: "Cull With Children Bounds",
      },
      cullRequestsWhileMoving: {
        value: true,
        label: "Cull Requests While Moving",
      },
      preloadWhenHidden: {
        value: false,
        label: "Preload When Hidden",
      },
      preloadFlightDestinations: {
        value: true,
        label: "Preload Flight Destinations",
      },
      preferLeaves: {
        value: false,
        label: "Prefer Leaves",
      },
    }),

    "Dynamic LOD": folder({
      dynamicScreenSpaceError: {
        value: true,
        label: "Dynamic Screen Space Error",
      },
      dynamicScreenSpaceErrorDensity: {
        value: 0.00028,
        min: 0,
        max: 0.001,
        step: 0.00001,
        label: "Density",
      },
      dynamicScreenSpaceErrorFactor: {
        value: 24,
        min: 1,
        max: 50,
        step: 0.1,
        label: "Factor",
      },
      dynamicScreenSpaceErrorHeightFalloff: {
        value: 0.25,
        min: 0,
        max: 1,
        step: 0.05,
        label: "Height Falloff",
      },
    }),

    "Level of Detail Skipping": folder({
      skipLevelOfDetail: {
        value: false,
        label: "Skip Level of Detail",
      },
      baseScreenSpaceError: {
        value: 1024,
        min: 1,
        max: 4096,
        step: 1,
        label: "Base Screen Space Error",
      },
      skipScreenSpaceErrorFactor: {
        value: 16,
        min: 1,
        max: 64,
        step: 1,
        label: "Skip Factor",
      },
      skipLevels: {
        value: 1,
        min: 0,
        max: 10,
        step: 1,
        label: "Skip Levels",
      },
      immediatelyLoadDesiredLevelOfDetail: {
        value: false,
        label: "Immediately Load Desired LOD",
      },
      loadSiblings: {
        value: false,
        label: "Load Siblings",
      },
    }),

    "Foveated Rendering": folder({
      foveatedScreenSpaceError: {
        value: true,
        label: "Foveated Screen Space Error",
      },
      foveatedConeSize: {
        value: 0.1,
        min: 0,
        max: 1,
        step: 0.01,
        label: "Cone Size",
      },
      foveatedMinimumScreenSpaceErrorRelaxation: {
        value: 0,
        min: 0,
        max: 128,
        step: 1,
        label: "Min SSE Relaxation",
      },
      foveatedTimeDelay: {
        value: 0.2,
        min: 0,
        max: 2,
        step: 0.05,
        label: "Time Delay (s)",
      },
    }),

    Advanced: folder({
      enableCollision: {
        value: false,
        label: "Enable Collision",
      },
      projectTo2D: {
        value: false,
        label: "Project To 2D",
      },
      enablePick: {
        value: false,
        label: "Enable Pick (WebGL 1)",
      },
    }),
  });

  // Load active tileset
  useEffect(() => {
    if (!ctx.sceneRef.current) return;
    const scene = ctx.sceneRef.current;

    const resource =
      activeTileset === "mesh2024" ? WUPP_MESH_2024 : WUPP_MESH_2020;
    let tileset: Cesium3DTileset;

    Cesium3DTileset.fromUrl(resource.url).then((loaded) => {
      tileset = loaded;

      // Apply shader from renderPreset
      if (resource.renderPreset?.customShader) {
        tileset.customShader = new CustomShader(
          resource.renderPreset.customShader
        );
      }

      scene.primitives.add(tileset);
      setLoadedTileset(tileset);

      // Fly to tileset
      if (scene.camera) {
        scene.camera.flyToBoundingSphere(tileset.boundingSphere);
      }
    });

    return () => {
      if (tileset && scene && !scene.isDestroyed()) {
        scene.primitives.remove(tileset);
      }
      setLoadedTileset(null);
    };
  }, [ctx.sceneRef, activeTileset]);

  // Apply style controls to active tileset
  useEffect(() => {
    if (!loadedTileset) return;

    const tileset = loadedTileset;
    const resource =
      activeTileset === "mesh2024" ? WUPP_MESH_2024 : WUPP_MESH_2020;

    // Apply shader preset
    const presetName = styleControls["Shader Preset"];
    if (presetName === "DEFAULT") {
      // Use shader from resource renderPreset
      if (resource.renderPreset?.customShader) {
        tileset.customShader = new CustomShader(
          resource.renderPreset.customShader
        );
      } else {
        tileset.customShader = undefined;
      }
    } else {
      // Use built-in shader preset
      const uniforms = BUILT_IN_SHADERS[presetName];
      if (uniforms) {
        const options = createUnlitCustomShaderConstructorOptions(uniforms);
        tileset.customShader = new CustomShader(options);
      }
    }

    // Apply visual style
    tileset.show = styleControls.show;

    // Opacity via color blend
    if (tileset.colorBlendMode !== undefined) {
      tileset.colorBlendAmount = styleControls.opacity;
    }

    // Color blend mode
    const blendModeMap: Record<string, number> = {
      HIGHLIGHT: Cesium3DTileColorBlendMode.HIGHLIGHT,
      REPLACE: Cesium3DTileColorBlendMode.REPLACE,
      MIX: Cesium3DTileColorBlendMode.MIX,
    };
    tileset.colorBlendMode = blendModeMap[styleControls.colorBlendMode];

    // Quality settings
    tileset.maximumScreenSpaceError = styleControls.maximumScreenSpaceError;
    tileset.backFaceCulling = styleControls.backFaceCulling;

    // Lighting
    tileset.shadows = styleControls.shadows;

    // Light color (RGB normalized 0-1)
    const { r, g, b } = styleControls.lightColor;
    tileset.lightColor = new Cartesian3(r / 255, g / 255, b / 255);
  }, [loadedTileset, styleControls, activeTileset]);

  return <CesiumStoryLayout />;
}
*/

/* Disabled - export
export const StyleControls: Story = {
  render: () => <TilesetShaderDemo />,
  parameters: {
    docs: {
      description: {
        story: `**[WIP]** Interactive tileset controls with Leva. All options from TilesetStyle and Cesium3DTileset.ConstructorOptions exposed:

**Mutable (real-time)**:
- Shader Preset, Visual Style (show, opacity, blend mode), Quality (maximumScreenSpaceError, backFaceCulling), Lighting (shadows, lightColor)

**Immutable (requires tileset recreation)**:
- Constructor Options: modelUpAxis/Forward, culling options, preload settings
- Dynamic LOD: dynamic screen space error parameters
- Level of Detail Skipping: skip LOD optimization settings
- Foveated Rendering: center-focused loading optimization
- Advanced: collision, 2D projection, picking

Note: Constructor options changes would require recreating the tileset - currently shown for reference only.`,
      },
    },
  },
};
*/
