import { useContext, useEffect } from "react";

import { builtInGazetteerHitTrigger } from "react-cismap/tools/gazetteerHelper";
import { TopicMapContext } from "react-cismap/contexts/TopicMapContextProvider";

import { useSelection } from "../components/SelectionProvider";

export const useSelectionTopicMap = (enable: boolean) => {
  const {
    selection,
    setSelection,
    overlayFeature,
    setOverlayFeature,
    isNewSelection,
    setIsNewSelection,
  } = useSelection();

  const topicMapCtx = useContext<typeof TopicMapContext>(TopicMapContext);

  const {
    //routedMapRef: routedMap,
    realRoutedMapRef: routedMapRef,
    referenceSystem,
    referenceSystemDefinition,
  } = topicMapCtx;
  console.debug("topicMapCtx", topicMapCtx);

  useEffect(() => {
    console.debug("HOOK: clear overlay on empty selection", selection);
    if (isNewSelection && selection === null) {
      setOverlayFeature(null);
    }
  }, [isNewSelection, selection, setOverlayFeature]);

  useEffect(() => {
    console.debug("HOOK: useSelectionTopicMap selection LEAFLET", selection);
    if (selection && isNewSelection && enable) {
      const { leafletElement } = routedMapRef.current?.leafletMap;
      builtInGazetteerHitTrigger(
        [selection],
        leafletElement,
        referenceSystem,
        referenceSystemDefinition,
        setSelection,
        setOverlayFeature
      );
      setIsNewSelection(false);
    }
    return () => console.info("unmounting useSelectionTopicMap");
  }, [
    isNewSelection,
    setIsNewSelection,
    enable,
    selection,
    routedMapRef,
    referenceSystem,
    referenceSystemDefinition,
    setSelection,
    setOverlayFeature,
  ]);
};
