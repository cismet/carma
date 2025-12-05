import { OverlayTourProvider } from "@carma-commons/ui/helper-overlay";
import { CesiumContextProvider } from "@carma-mapping/engines/cesium";
import { TopicMapContextProvider } from "react-cismap/contexts/TopicMapContextProvider";

import { GazDataProvider } from "./GazDataProvider";
import { SelectionProvider } from "./SelectionProvider";
import {
  MapStyleProvider,
  type MapStyleConfig,
} from "../contexts/MapStyleProvider";
import { GazDataConfig } from "@carma-commons/utils";
import { defaultGazDataConfig } from "@carma-commons/resources";
import { AuthProvider } from "@carma-providers/auth";

import { type HashCodecs } from "@carma-providers/hash-state";
import {
  type APIRootState,
  CarmaMapAPIProvider,
} from "@carma-mapping/carma-map-api";
import { SandboxedEvalProvider } from "./SandboxedEvalProvider";

import type { Store } from "redux";

type CarmaMapProviderWrapperProps<TState extends APIRootState = APIRootState> =
  {
    children: React.ReactNode;
    overlayOptions: { background: { transparency: number; color: string } };
    cesiumOptions: { providerConfig: any; tilesetConfigs: any };
    gazDataConfig?: GazDataConfig;
    mapStyleConfig: MapStyleConfig;
    /** Redux store instance from the app for cross-library state access */
    store?: Store<TState>;
    /** @deprecated HashStateProvider should be placed higher in the tree. These props are ignored. */
    hashKeyAliases?: Record<string, string>;
    /** @deprecated HashStateProvider should be placed higher in the tree. These props are ignored. */
    hashCodecs?: HashCodecs;
    /** @deprecated HashStateProvider should be placed higher in the tree. These props are ignored. */
    keyOrder?: string[];
  };

export const CarmaMapProviderWrapper = <
  TState extends APIRootState = APIRootState
>({
  children,
  overlayOptions,
  cesiumOptions,
  gazDataConfig = defaultGazDataConfig,
  mapStyleConfig,
  store,
}: CarmaMapProviderWrapperProps<TState>) => {
  const { background } = overlayOptions;
  const { transparency, color } = background;

  if (gazDataConfig.crs !== "3857") {
    console.warn(
      "Gazetteer data CRS is not supported, it should be 3857, Spherical Mercator"
    );
  }

  return (
    <AuthProvider>
      <SandboxedEvalProvider>
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
                    {store ? (
                      <CarmaMapAPIProvider store={store}>
                        {children}
                      </CarmaMapAPIProvider>
                    ) : (
                      children
                    )}
                  </CesiumContextProvider>
                </OverlayTourProvider>
              </TopicMapContextProvider>
            </MapStyleProvider>
          </SelectionProvider>
        </GazDataProvider>
      </SandboxedEvalProvider>
    </AuthProvider>
  );
};

export default CarmaMapProviderWrapper;
