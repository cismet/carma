import { useEffect } from "react";
import { useSelector } from "react-redux";
import { getSelectedFeatureData } from "../../store/slices/featureCollection";
import { LeitungForm } from "../ui/featuresForm";

const FeatureFormDemo = () => {
  const selectedFeatureData = useSelector(getSelectedFeatureData);

  useEffect(() => {
    console.log("selectedFeatureData:", selectedFeatureData);
  }, [selectedFeatureData]);

  return (
    <div className="h-[900px] bg-white p-4">
      <LeitungForm data={selectedFeatureData} />
      {/* <h2 style={{ marginTop: 20 }}>Raw Data</h2>
      <pre>{JSON.stringify(selectedFeatureData, null, 2)}</pre> */}
    </div>
  );
};

export default FeatureFormDemo;
