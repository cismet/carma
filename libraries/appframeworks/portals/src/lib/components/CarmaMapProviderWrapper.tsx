import { useMemo } from "react";

import { OverlayTourProvider } from "@carma-commons/ui/helper-overlay";
import { CesiumContextProvider } from "@carma-mapping/engines/cesium";
import { CarmaTopicMapContextProvider } from "@carma-mapping/engines/carma-cismap";
import { TransitionContextProvider } from "@carma-mapping/map-transition-2d-3d";

import { normalizeOptions } from "@carma-commons/utils";
import { type GazDataConfig } from "@carma-commons/gazetteer";
import { defaultGazDataConfig } from "@carma-commons/resources";
import { AuthProvider } from "@carma-providers/auth";
import { EventBusProvider } from "@carma-providers/event-bus";

import { GazDataProvider } from "./GazDataProvider";
import { SelectionProvider } from "./SelectionProvider";
import {
  MapStyleProvider,
  type MapStyleConfig,
} from "../contexts/MapStyleProvider";
import { HashCodecs, HashStateProvider } from "../contexts/HashStateProvider";
import { defaultHashCodecs } from "../utils/hashState";
import { SandboxedEvalProvider } from "./SandboxedEvalProvider";
import { defaultHashKeyAliases } from "../constants";
import type { GeoportalEventMap } from "../types/GeoportalEventMap";

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
        <EventBusProvider<GeoportalEventMap>>
          <SandboxedEvalProvider>
            <GazDataProvider config={gazDataConfig}>
              <SelectionProvider>
                <MapStyleProvider config={mapStyleConfig}>
                  <TransitionContextProvider>
                    <CarmaTopicMapContextProvider infoBoxPixelWidth={350}>
                      <OverlayTourProvider
                        transparency={transparency}
                        color={color}
                      >
                        <CesiumContextProvider
                          //initialViewerState={defaultCesiumState}
                          // TODO move these to store/slice setup ?
                          providerConfig={cesiumOptions.providerConfig}
                          tilesetConfigs={cesiumOptions.tilesetConfigs}
                        >
                          {children}
                        </CesiumContextProvider>
                      </OverlayTourProvider>
                    </CarmaTopicMapContextProvider>
                  </TransitionContextProvider>
                </MapStyleProvider>
              </SelectionProvider>
            </GazDataProvider>
          </SandboxedEvalProvider>
        </EventBusProvider>
      </AuthProvider>
    </HashStateProvider>
  );
};

export default CarmaMapProviderWrapper;
