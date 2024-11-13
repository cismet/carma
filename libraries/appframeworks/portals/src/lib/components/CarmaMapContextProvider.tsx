import { OverlayTourProvider } from "@carma-commons/ui/lib-helper-overlay";
import { CesiumContextProvider } from "@carma-mapping/cesium-engine";
import { createContext, useContext, useMemo, useState } from "react";
import {
  TopicMapContext,
  TopicMapContextProvider,
} from "react-cismap/contexts/TopicMapContextProvider";

type CarmaMapProviderProps = {
  children: React.ReactNode;
  overlayOptions: { background: { transparency: number; color: string } };
  cesiumOptions: { providerConfig: any; tilesetConfigs: any };
};

const CarmaMapContext = createContext({
  setShowTourOverlay: (show: boolean) => {},
});

export const useCarmaMapContext = () => {
  const context = useContext(CarmaMapContext);
  // forward other contexts here if needed
  const topicMapContext = useContext<typeof TopicMapContext>(TopicMapContext);
  if (!context) {
    throw new Error(
      "useCarmaMapContext must be used within a CarmaMapProvider"
    );
  }
  return useMemo(
    () => ({
      ...context,
      routedMapRef: topicMapContext.realRoutedMapRef,
      topicMapContext,
    }),
    [context, topicMapContext]
  );
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

  return (
    <TopicMapContextProvider>
      <OverlayTourProvider
        show={showTourOverlay}
        closeOverlay={() => setShowTourOverlay(false)}
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
  );
};

export default CarmaMapContextProvider;
