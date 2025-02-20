import InfoBox from "react-cismap/topicmaps/InfoBox";

const LoadingInfoBox = () => {
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
        <div className="w-36 h-2 bg-zinc-400 rounded-md animate-pulse" />
      }
      header="Laden"
    />
  );
};

export default LoadingInfoBox;
