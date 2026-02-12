import { featureFormRegistry } from "./index";

interface FeaturesFormsWrapperProps {
  featureType?: string;
  data: any;
  rawFeature?: any;
}

// Map sourceLayer values to registry keys
const featureTypeToFormKey: Record<string, string> = {
  leuchten: "leuchte",
  tdta_leuchten: "leuchte",
  leitungen: "leitung",
  leitung: "leitung",
  tdta_standort_mast: "mast",
  standort_mast: "mast",
  masten: "mast",
  mast: "mast",
  schaltstelle: "schaltstelle",
  schaltstellen: "schaltstelle",
  mauerlasche: "mauerlasche",
  mauerlaschen: "mauerlasche",
};

const FeaturesFormsWrapper = ({
  featureType,
  data,
  rawFeature,
}: FeaturesFormsWrapperProps) => {
  const formKey = featureType ? featureTypeToFormKey[featureType] : undefined;
  const FormComponent = formKey ? featureFormRegistry[formKey] : undefined;

  if (FormComponent) {
    return <FormComponent data={data} rawFeature={rawFeature} />;
  }

  // Fallback: JSON display for feature types without forms
  // Extract first item from data for display
  const dataKey = data ? Object.keys(data)?.[0] : undefined;
  const dataArray = dataKey ? data[dataKey] : null;
  const displayData = Array.isArray(dataArray) ? dataArray[0] : data;

  return (
    <div>
      <div
        style={{
          fontSize: 12,
          fontWeight: 600,
          color: "#888",
          marginBottom: 8,
          textTransform: "uppercase",
          letterSpacing: "0.05em",
        }}
      >
        Feature-Daten (Server)
      </div>
      <pre
        style={{
          fontSize: 11,
          lineHeight: 1.5,
          background: "#e8f5e9",
          padding: 12,
          borderRadius: 4,
          overflow: "auto",
          maxHeight: 3000,
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
        }}
      >
        {JSON.stringify(displayData, null, 2)}
      </pre>
    </div>
  );
};

export default FeaturesFormsWrapper;
