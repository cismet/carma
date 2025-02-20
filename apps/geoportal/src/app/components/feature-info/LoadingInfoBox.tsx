import InfoBox from "react-cismap/topicmaps/InfoBox";
import { useSelector } from "react-redux";
import { getLayers } from "../../store/slices/mapping";
import InfoBoxHeader from "react-cismap/topicmaps/InfoBoxHeader";
import { useEffect, useState } from "react";

const LoadingInfoBox = () => {
  const layers = useSelector(getLayers);
  const [shouldRender, setShouldRender] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setShouldRender(true);
    }, 500);

    return () => clearTimeout(timer);
  }, []);

  if (!shouldRender) {
    return null;
  }

  const featureHeaders = layers.map((layer, i) => {
    return (
      <div
        style={{
          width: "340px",
          paddingBottom: 3,
          paddingLeft: 10 + i * 10,
          cursor: "pointer",
        }}
        key={"overlapping."}
      >
        <InfoBoxHeader
          content={
            <div className="w-full h-4 flex items-center">
              <div className="w-14 h-2 bg-zinc-600 rounded-md animate-pulse" />
            </div>
          }
          headerColor={"grey"}
        ></InfoBoxHeader>
      </div>
    );
  });

  return (
    <InfoBox
      pixelwidth={350}
      currentFeature={{}}
      hideNavigator={true}
      headerColor="#0078a8"
      title={<div className="w-24 h-5 bg-zinc-400 rounded-md animate-pulse" />}
      additionalInfo={
        '<html><div className="w-56 h-4 bg-zinc-400 rounded-md animate-pulse" /></html>'
      }
      subtitle={
        <div className="w-36 h-2 bg-zinc-400 rounded-md animate-pulse mb-4" />
      }
      header="Laden"
      secondaryInfoBoxElements={featureHeaders}
    />
  );
};

export default LoadingInfoBox;
