import { useSelector } from "react-redux";
import { getLayers } from "../../store/slices/mapping";
import InfoBoxHeader from "react-cismap/topicmaps/InfoBoxHeader";
import {
  getPreferredLayerId,
  getSelectedFeature,
} from "../../store/slices/features";
import { TopicMapContext } from "react-cismap/contexts/TopicMapContextProvider";
import { useContext, useEffect, useState } from "react";
import { getQueryableLayers } from "../GeoportalMap/utils";
import { getHashParams } from "@carma-commons/utils";
import { InfoBox } from "@carma-apps/portals";

type RenderedElements = {
  additionalInfo?: boolean;
  subtitle?: boolean;
};

const LoadingInfoBox = () => {
  const [renderedLoadingElements, setRenderedLoadingElements] =
    useState<RenderedElements>({});

  const layers = useSelector(getLayers);
  const selectedFeature = useSelector(getSelectedFeature);
  const preferredLayerId = useSelector(getPreferredLayerId);

  const { routedMapRef } = useContext<typeof TopicMapContext>(TopicMapContext);
  const hashParams = getHashParams();
  const map = routedMapRef?.leafletMap?.leafletElement;
  const zoom = map?.getZoom() ?? hashParams.zoom;

  const queryableLayers = getQueryableLayers(layers, zoom);

  const featureHeaders = queryableLayers.map((layer, i) => {
    let title = layer.title;
    if (preferredLayerId === layer.id) {
      title = "Position";
    } else if (
      (!preferredLayerId ||
        !queryableLayers.find((l) => l.id === preferredLayerId)) &&
      i === queryableLayers.length - 1
    ) {
      title = "Position";
    }

    return (
      <div
        style={{
          width: "340px",
          paddingBottom: 3,
          paddingLeft: 10 + i * 10,
          cursor: "pointer",
          fontSize: "0.75rem",
          fontFamily: "Helvetica Neue, Arial, Helvetica, sans-serif",
        }}
        key={"overlapping."}
      >
        <InfoBoxHeader content={title} headerColor={"grey"}></InfoBoxHeader>
      </div>
    );
  });

  useEffect(() => {
    if (layers.length > 0 && layers[0]?.conf?.infoboxMapping) {
      let visibleElements: RenderedElements = {};
      if (Array.isArray(layers[0].conf.infoboxMapping)) {
        layers[0].conf.infoboxMapping.forEach((mapping) => {
          if (mapping.includes("additionalInfo")) {
            visibleElements.additionalInfo = true;
          }
          if (mapping.includes("subtitle")) {
            visibleElements.subtitle = true;
          }
        });
      }
      setRenderedLoadingElements(visibleElements);
    }
  }, [layers]);

  return (
    <InfoBox
      pixelwidth={350}
      currentFeature={{}}
      hideNavigator={true}
      headerColor={
        selectedFeature?.properties.headerColor
          ? selectedFeature.properties.headerColor
          : "#0078a8"
      }
      title={
        <div className="w-full flex items-center justify-between">
          <div className="w-24 h-5 bg-zinc-400 rounded-md animate-pulse" />
          <div className="-mr-3 flex gap-2">
            <div className="w-6 h-6 bg-zinc-400 rounded-md animate-pulse" />
            <div className="w-6 h-6 bg-zinc-400 rounded-md animate-pulse" />
            <div className="w-6 h-6 bg-zinc-400 rounded-md animate-pulse" />
          </div>
        </div>
      }
      additionalInfo={
        renderedLoadingElements.additionalInfo
          ? '<html><div className="w-56 h-4 bg-zinc-400 rounded-md animate-pulse" /></html>'
          : undefined
      }
      subtitle={
        renderedLoadingElements.subtitle ? (
          <div className="w-36 h-2 bg-zinc-400 rounded-md animate-pulse mb-4" />
        ) : undefined
      }
      header={
        preferredLayerId &&
        queryableLayers.find((l) => l.id === preferredLayerId)
          ? queryableLayers.find((l) => l.id === preferredLayerId)?.title
          : queryableLayers[queryableLayers.length - 1].title
      }
      secondaryInfoBoxElements={featureHeaders}
    />
  );
};

export default LoadingInfoBox;
