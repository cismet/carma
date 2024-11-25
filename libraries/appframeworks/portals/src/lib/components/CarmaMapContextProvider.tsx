import { OverlayTourProvider } from "@carma-commons/ui/lib-helper-overlay";
import {
  CesiumContextProvider,
  CesiumContextType,
  useCesiumContext,
} from "@carma-mapping/cesium-engine";
import {
  createContext,
  Dispatch,
  SetStateAction,
  useContext,
  useMemo,
  useState,
} from "react";
import {
  TopicMapContext,
  TopicMapContextProvider,
} from "react-cismap/contexts/TopicMapContextProvider";

import { GazDataProvider } from "./GazDataProvider";
import { SelectionProvider } from "./SelectionProvider";

type CarmaMapProviderProps = {
  children: React.ReactNode;
  overlayOptions: { background: { transparency: number; color: string } };
  cesiumOptions: { providerConfig: any; tilesetConfigs: any };
};

type CarmaMapContextType = {
  setShowTourOverlay: Dispatch<SetStateAction<boolean>>;
};

const CarmaMapContext = createContext<CarmaMapContextType | null>(null);

export const useCarmaMapContext = () => {
  const context = useContext(CarmaMapContext);

  if (!context) {
    throw new Error(
      "useCarmaMapContext must be used within a CarmaMapProvider"
    );
  }
  return context;
};

export const CarmaMapContextProvider = ({
  children,
  overlayOptions,
  cesiumOptions,
}: CarmaMapProviderProps) => {
  const { background } = overlayOptions;
  const { transparency, color } = background;

  const [showTourOverlay, setShowTourOverlay] = useState(false);

  const value = {
    setShowTourOverlay,
  };

  const closeOverlay = () => {
    setShowTourOverlay(false);
  };

  return (
    <GazDataProvider>
      <SelectionProvider>
        <TopicMapContextProvider>
          <OverlayTourProvider
            show={showTourOverlay}
            closeOverlay={closeOverlay}
            transparency={transparency}
            color={color}
          >
            <CesiumContextProvider
              //initialViewerState={defaultCesiumState}
              // TODO move these to store/slice setup ?
              providerConfig={cesiumOptions.providerConfig}
              tilesetConfigs={cesiumOptions.tilesetConfigs}
            >
              <CarmaMapContext.Provider value={value}>
                {children}
              </CarmaMapContext.Provider>
            </CesiumContextProvider>
          </OverlayTourProvider>
        </TopicMapContextProvider>
      </SelectionProvider>
    </GazDataProvider>
  );
};

export default CarmaMapContextProvider;
