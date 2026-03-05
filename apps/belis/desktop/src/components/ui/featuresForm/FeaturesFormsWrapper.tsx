import { useState, useCallback } from "react";
import { featureFormRegistry } from "./index";

interface FeaturesFormsWrapperProps {
  featureType?: string;
  data: any;
  rawFeature?: any;
  readOnly?: boolean;
  loading?: boolean;
}

// Map sourceLayer values to registry keys
const featureTypeToFormKey: Record<string, string> = {
  leuchten: "leuchte",
  tdta_leuchten: "leuchte",
  leitungen: "leitung",
  leitung: "leitung",
  tdta_standort_mast: "standort",
  standort_mast: "standort",
  masten: "standort",
  mast: "standort",
  standorte: "standort",
  schaltstelle: "schaltstelle",
  schaltstellen: "schaltstelle",
  mauerlasche: "mauerlasche",
  mauerlaschen: "mauerlasche",
  abzweigdose: "abzweigdose",
  abzweigdosen: "abzweigdose",
};

const FeaturesFormsWrapper = ({
  featureType,
  data,
  rawFeature,
  readOnly: readOnlyProp = true,
  loading,
}: FeaturesFormsWrapperProps) => {
  const [isEditing, setIsEditing] = useState(false);
  const [resetKey, setResetKey] = useState(0);
  const effectiveReadOnly = readOnlyProp && !isEditing;

  const handleToggleReadOnly = useCallback(() => {
    setIsEditing((prev) => !prev);
  }, []);

  const handleCancel = useCallback(() => {
    setResetKey((prev) => prev + 1);
    setIsEditing(false);
  }, []);

  const handleSaveComplete = useCallback(() => {
    setIsEditing(false);
  }, []);

  const formKey = featureType ? featureTypeToFormKey[featureType] : undefined;
  const FormComponent = formKey ? featureFormRegistry[formKey] : undefined;

  if (FormComponent) {
    return (
      <div className="h-full">
        <FormComponent
          key={resetKey}
          data={data}
          rawFeature={rawFeature}
          readOnly={effectiveReadOnly}
          loading={loading}
          onToggleReadOnly={handleToggleReadOnly}
          onCancel={handleCancel}
          onSaveComplete={handleSaveComplete}
        />
      </div>
    );
  }
};

export default FeaturesFormsWrapper;
