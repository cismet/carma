import { useEffect } from "react";
import { useSelector } from "react-redux";
import { getSelectedFeatureData } from "../../store/slices/featureCollection";

const FeatureFormDemo = () => {
  const selectedFeatureData = useSelector(getSelectedFeatureData);

  useEffect(() => {
    console.log("selectedFeatureData:", selectedFeatureData);
  }, [selectedFeatureData]);

  return (
    <div style={{ padding: 20 }}>
      <h1>Feature Form Demo</h1>
      <pre>{JSON.stringify(selectedFeatureData, null, 2)}</pre>
    </div>
  );
};

export default FeatureFormDemo;
