import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import { useControls } from "leva";
import {
  CesiumContextProvider,
  CesiumSceneComponent,
} from "@carma-mapping/engines/cesium/core";
import { CesiumObliqueMode } from "@carma-mapping/engines/cesium/oblique-mode";
import { STORYBOOK_CESIUM_CONFIG } from "../core/storybook-cesium.config";
import { ManagedProjections } from "@carma/geo/proj";

function ObliqueDemo() {
  const [obliqueEnabled, setObliqueEnabled] = useState(false);

  useControls("Oblique Mode", {
    "Toggle Oblique Mode": {
      value: obliqueEnabled,
      onChange: (value) => setObliqueEnabled(value),
    },
  });

  // Oblique config based on geoportal setup
  const obliqueConfig = {
    exteriorOrientationsURI:
      "https://wunda-geoportal-cache.cismet.de/oblique/2024/ext_ori_utm32.json",
    footprintsURI:
      "https://wunda-geoportal-cache.cismet.de/oblique/2024/fprfc.geojson",
    crs: ManagedProjections.EPSG25832,
    previewPath: "https://wunda-geoportal-cache.cismet.de/oblique/2024/preview",
    previewQualityLevel: "3" as any,
    fixedPitch: -0.785,
    fixedHeight: 900,
    minFov: 0.174,
    maxFov: 2.094,
    headingOffset: -0.599,
  } as any;

  return (
    <div style={{ width: "100vw", height: "100vh", position: "relative" }}>
      <CesiumSceneComponent />
      {obliqueEnabled && (
        <CesiumObliqueMode config={obliqueConfig} isActive={obliqueEnabled} />
      )}
    </div>
  );
}

// Wrapper component for stories
function CesiumContextWrapper({ children }: { children: React.ReactNode }) {
  return (
    <CesiumContextProvider config={STORYBOOK_CESIUM_CONFIG}>
      {children}
    </CesiumContextProvider>
  );
}

const meta: Meta = {
  title: "mapping\\engines\\cesium/oblique-mode",
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

export const ObliqueToggle: Story = {
  render: () => <ObliqueDemo />,
};
