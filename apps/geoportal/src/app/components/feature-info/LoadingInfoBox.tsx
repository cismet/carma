import InfoBox from "react-cismap/topicmaps/InfoBox";
import { useSelector } from "react-redux";
import { getLayers } from "../../store/slices/mapping";
import InfoBoxHeader from "react-cismap/topicmaps/InfoBoxHeader";

const LoadingInfoBox = () => {
  const layers = useSelector(getLayers);

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
          content={i === layers.length - 1 ? "Position" : layer.title}
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
        '<html><div className="w-56 h-4 bg-zinc-400 rounded-md animate-pulse" /></html>'
      }
      subtitle={
        <div className="w-36 h-2 bg-zinc-400 rounded-md animate-pulse mb-4" />
      }
      header={layers[layers.length - 1].title}
      secondaryInfoBoxElements={featureHeaders}
    />
  );
};

export default LoadingInfoBox;
