import { OverlayTourProvider } from "@carma-commons/ui/lib-helper-overlay";
import { CesiumContextProvider } from "@carma-mapping/cesium-engine";
import { TopicMapContextProvider } from "react-cismap/contexts/TopicMapContextProvider";

import { GazDataProvider } from "./GazDataProvider";
import { SelectionProvider } from "./SelectionProvider";
import { GazDataConfig } from "@carma-commons/utils";
import { defaultGazDataConfig } from "@carma-commons/resources";

type CarmaMapProviderWrapperProps = {
  children: React.ReactNode;
  overlayOptions: { background: { transparency: number; color: string } };
  cesiumOptions: { providerConfig: any; tilesetConfigs: any };
  gazDataConfig?: GazDataConfig;
};

export const CarmaMapProviderWrapper = ({
  children,
  overlayOptions,
  cesiumOptions,
  gazDataConfig = defaultGazDataConfig,
}: CarmaMapProviderWrapperProps) => {
  const { background } = overlayOptions;
  const { transparency, color } = background;

  if (gazDataConfig.crs !== "3857") {
    console.warn(
      "Gazetteer data CRS is not supported, it should be 3857, Spherical Mercator"
    );
  }

  return (
    <GazDataProvider config={gazDataConfig}>
      <SelectionProvider>
        <TopicMapContextProvider infoBoxPixelWidth={350}>
          <OverlayTourProvider transparency={transparency} color={color}>
            <CesiumContextProvider
              //initialViewerState={defaultCesiumState}
              // TODO move these to store/slice setup ?
              providerConfig={cesiumOptions.providerConfig}
              tilesetConfigs={cesiumOptions.tilesetConfigs}
            >
              {children}
            </CesiumContextProvider>
          </OverlayTourProvider>
        </TopicMapContextProvider>
      </SelectionProvider>
    </GazDataProvider>
  );
};

export default CarmaMapProviderWrapper;
