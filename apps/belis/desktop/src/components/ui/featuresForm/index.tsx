import AbzweigdoseForm from "./AbzweigdoseForm";
import LeitungForm from "./LeitungForm";
import LeuchteForm from "./LeuchteForm";
import MastForm from "./MastForm";
import MauerlascheForm from "./MauerlascheForm";
import SchaltstelleForm from "./SchaltstelleForm";
import FeaturesFormsWrapper from "./FeaturesFormsWrapper";

export {
  AbzweigdoseForm,
  LeitungForm,
  LeuchteForm,
  MastForm,
  MauerlascheForm,
  SchaltstelleForm,
  FeaturesFormsWrapper,
};

export const featureFormRegistry: Record<string, React.ComponentType<any>> = {
  abzweigdose: AbzweigdoseForm,
  leitung: LeitungForm,
  leuchte: LeuchteForm,
  mast: MastForm,
  mauerlasche: MauerlascheForm,
  schaltstelle: SchaltstelleForm,
};
