import { useContext } from "react";
// @ts-ignore - react-cismap has no type declarations
import { TopicMapContext as ReactCismapTopicMapContext } from "react-cismap/contexts/TopicMapContextProvider";
import {
  CarmaTopicMapContext,
  type CarmaTopicMapContextType,
} from "./CarmaTopicMapContext";

export type CombinedTopicMapContextType = CarmaTopicMapContextType &
  typeof ReactCismapTopicMapContext;

/**
 * Hook to access the Carma TopicMap context with simplified leafletMap access.
 * Also provides the original react-cismap context for advanced use cases.
 * Throws if used outside CarmaTopicMapContextProvider.
 */
export const useCarmaTopicMapContext = () => {
  const carmaContext = useContext(CarmaTopicMapContext);
  const reactCismapContext = useContext(ReactCismapTopicMapContext);

  if (!carmaContext) {
    throw new Error(
      "useCarmaTopicMapContext must be used within CarmaTopicMapContextProvider"
    );
  }

  return {
    ...carmaContext,
    leafletMap: carmaContext.leafletMapRef.current,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ...(reactCismapContext as any),
  };
};

export default useCarmaTopicMapContext;
