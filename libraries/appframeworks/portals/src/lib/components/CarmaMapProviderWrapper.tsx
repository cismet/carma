import { useMemo } from "react";

import { OverlayTourProvider } from "@carma-commons/ui/helper-overlay";
import { CesiumContextProvider } from "@carma-mapping/engines/cesium/core";
import { CarmaTopicMapContextProvider } from "@carma-mapping/engines/carma-cismap";
import { TransitionContextProvider } from "@carma-mapping/map-transition-2d-3d";
import { MapViewStateProvider } from "@carma-mapping/map-view-state";

import { normalizeOptions } from "@carma-commons/utils";
import { type GazDataConfig } from "@carma-commons/gazetteer";
import { defaultGazDataConfig } from "@carma/resources";
import { AuthProvider } from "@carma/providers/auth";

import { GazDataProvider } from "./GazDataProvider";
import { SelectionProvider, type SelectionItem } from "./SelectionProvider";
import type { FeatureInfo } from "@carma/types";
import {
  MapStyleProvider,
  type MapStyleConfig,
} from "../contexts/MapStyleProvider";
import {
  HashCodecs,
  HashStateProvider,
  useHashState,
} from "../contexts/HashStateProvider";
import { defaultHashCodecs } from "../utils/hashState";
import { SandboxedEvalProvider } from "./SandboxedEvalProvider";
import { defaultHashKeyAliases } from "../constants";

type CarmaMapProviderWrapperProps = {
  children: React.ReactNode;
  overlayOptions: { background: { transparency: number; color: string } };
  cesiumOptions: any;
  gazDataConfig?: GazDataConfig;
  mapStyleConfig: MapStyleConfig;
  hashKeyAliases?: Record<string, string>;
  hashCodecs?: HashCodecs;
  keyOrder?: string[];
  // TODO: Remove onSelectionChange when Redux is fully removed from apps
  // Optional callback for syncing selection to external state (e.g., Redux)
  onSelectionChange?: (selection: SelectionItem | null) => void;
  // TODO: Remove onModelSelectionChange when Redux is fully removed from apps
  // Optional callback for syncing model selection to external state (e.g., Redux)
  onModelSelectionChange?: (feature: FeatureInfo | null) => void;
};

export const CarmaMapProviderWrapper = ({
  children,
  overlayOptions,
  cesiumOptions,
  gazDataConfig = defaultGazDataConfig,
  mapStyleConfig,
  hashKeyAliases,
  hashCodecs,
  onSelectionChange,
  onModelSelectionChange,
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
      <MapViewStateProvider useHashState={useHashState} initialMode="2d">
        <AuthProvider>
          <SandboxedEvalProvider>
            <GazDataProvider config={gazDataConfig}>
              <SelectionProvider
                onSelectionChange={onSelectionChange}
                onModelSelectionChange={onModelSelectionChange}
              >
                <MapStyleProvider config={mapStyleConfig}>
                  <TransitionContextProvider
                    config={cesiumOptions?.transitions}
                  >
                    <CarmaTopicMapContextProvider infoBoxPixelWidth={350}>
                      <OverlayTourProvider
                        transparency={transparency}
                        color={color}
                      >
                        <CesiumContextProvider config={cesiumOptions}>
                          {children}
                        </CesiumContextProvider>
                      </OverlayTourProvider>
                    </CarmaTopicMapContextProvider>
                  </TransitionContextProvider>
                </MapStyleProvider>
              </SelectionProvider>
            </GazDataProvider>
          </SandboxedEvalProvider>
        </AuthProvider>
      </MapViewStateProvider>
    </HashStateProvider>
  );
};

export default CarmaMapProviderWrapper;
