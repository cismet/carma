import { useContext } from "react";

import { ResponsiveTopicMapContext } from "react-cismap/contexts/ResponsiveTopicMapContextProvider";

const Comp = () => {
  const { windowSize } = useContext(ResponsiveTopicMapContext);

  return (
    <div>
      <div
        style={{
          position: "absolute",
          top: (windowSize?.height || 500) / 2 - 1,
          width: windowSize?.width || "100%",
          height: "2px",
          backgroundColor: "#00000023",
          zIndex: "100000",
          pointerEvents: "none",
        }}
      ></div>
      <div
        style={{
          position: "absolute",
          left: (windowSize?.width || 500) / 2 - 1,
          height: windowSize?.height || "100%",
          width: "2px",
          backgroundColor: "#00000023",
          zIndex: "100000",
          pointerEvents: "none",
        }}
      ></div>
      <div
        style={{
          borderRadius: "50%",
          position: "absolute",
          left: (windowSize?.width || 500) / 2 - 10,
          top: (windowSize?.height || 500) / 2 - 10,
          height: "20px",
          width: "20px",
          backgroundColor: "#00000023",
          zIndex: "100000",
          pointerEvents: "none",
        }}
      ></div>
    </div>
  );
};

export default Comp;
