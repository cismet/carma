import { featureFormRegistry } from "./index";

interface FeaturesFormsWrapperProps {
  featureType?: string;
  data: any;
  rawFeature?: any;
  readOnly?: boolean;
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
  abzweigdose: "abzweigdose",
  abzweigdosen: "abzweigdose",
};

const FeaturesFormsWrapper = ({
  featureType,
  data,
  rawFeature,
  readOnly = true,
}: FeaturesFormsWrapperProps) => {
  const formKey = featureType ? featureTypeToFormKey[featureType] : undefined;
  const FormComponent = formKey ? featureFormRegistry[formKey] : undefined;

  if (FormComponent) {
    return <FormComponent data={data} rawFeature={rawFeature} readOnly={readOnly} />;
  }
};

export default FeaturesFormsWrapper;
