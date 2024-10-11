import { memo, useContext } from "react";
import { useDispatch, useSelector } from "react-redux";

import PaleOverlay from "react-cismap/PaleOverlay";

import { createCismapLayers } from "../topicmap.utils";
import { getFocusMode } from "../../../store/slices/mapping";
import { TopicMapContext } from "react-cismap/contexts/TopicMapContextProvider";
import { Layer } from "@carma-mapping/layers";
import { UIMode } from "../../../store/slices/ui";

const CismapLayers = ({
  layers,
  mode,
  setPos,
}: {
  layers: Layer[];
  mode: UIMode;
  setPos: (pos: [number, number]) => void;
}) => {
  const dispatch = useDispatch();
  const focusMode = useSelector(getFocusMode);
  const { routedMapRef } = useContext<typeof TopicMapContext>(TopicMapContext);

  const leafletEl = routedMapRef?.leafletMap?.leafletElement;

  const layersComponent = createCismapLayers(layers, {
    focusMode,
    mode,
    dispatch,
    setPos,
    zoom: leafletEl.getZoom(),
  });

  console.log("CismapLayers updated", layersComponent);
  return (
    <>
      {focusMode && <PaleOverlay />}
      {layersComponent}
    </>
  );
};

export default memo(CismapLayers);
