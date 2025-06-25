import { OverlayTourProvider } from "@carma-commons/ui/lib-helper-overlay";
import { CesiumContextProvider } from "@carma-mapping/cesium-engine";
import { TopicMapContextProvider } from "react-cismap/contexts/TopicMapContextProvider";

import { GazDataProvider } from "./GazDataProvider";
import { SelectionProvider } from "./SelectionProvider";
import {
  MapStyleProvider,
  type MapStyleConfig,
} from "../contexts/MapStyleProvider";
import { GazDataConfig, normalizeOptions } from "@carma-commons/utils";
import { defaultGazDataConfig } from "@carma-commons/resources";
import { HashCodecs, HashStateProvider } from "../contexts/HashStateProvider";
import { defaultHashCodecs, defaultHashKeyAliases } from "../utils/hashState";
import { useMemo } from "react";
import { AuthProvider } from "./AuthProvider";

type CarmaMapProviderWrapperProps = {
  children: React.ReactNode;
  overlayOptions: { background: { transparency: number; color: string } };
  cesiumOptions: { providerConfig: any; tilesetConfigs: any };
  gazDataConfig?: GazDataConfig;
  mapStyleConfig: MapStyleConfig;
  hashKeyAliases?: Record<string, string>;
  hashCodecs?: HashCodecs;
  keyOrder?: string[];
};

export const CarmaMapProviderWrapper = ({
  children,
  overlayOptions,
  cesiumOptions,
  gazDataConfig = defaultGazDataConfig,
  mapStyleConfig,
  hashKeyAliases,
  hashCodecs,
  keyOrder = [
    "lat",
    "lng",
    "zoom",
    "h",
    "heading",
    "bearing",
    "pitch",
    "roll",
    "fov",
    "m",
    "isOblique",
  ],
}: CarmaMapProviderWrapperProps) => {
  const { background } = overlayOptions;
  const { transparency, color } = background;

  const aliases = useMemo(
    () => normalizeOptions(hashKeyAliases, defaultHashKeyAliases),
    [hashKeyAliases]
  );
  const codecs = useMemo(
    () => normalizeOptions(hashCodecs, defaultHashCodecs),
    [hashCodecs]
  );

  if (gazDataConfig.crs !== "3857") {
    console.warn(
      "Gazetteer data CRS is not supported, it should be 3857, Spherical Mercator"
    );
  }

  return (
    <HashStateProvider
      keyAliases={aliases}
      hashCodecs={codecs}
      keyOrder={keyOrder}
    >
      <AuthProvider>
        <GazDataProvider config={gazDataConfig}>
          <SelectionProvider>
            <MapStyleProvider config={mapStyleConfig}>
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
            </MapStyleProvider>
          </SelectionProvider>
        </GazDataProvider>
      </AuthProvider>
    </HashStateProvider>
  );
};

export default CarmaMapProviderWrapper;
