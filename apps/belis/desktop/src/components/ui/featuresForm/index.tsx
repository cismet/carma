import AbzweigdoseForm from "./AbzweigdoseForm";
import LeitungForm from "./LeitungForm";
import LeuchteForm from "./LeuchteForm";
import StandortForm from "./StandortForm";
import MauerlascheForm from "./MauerlascheForm";
import SchaltstelleForm from "./SchaltstelleForm";
import FeaturesFormsWrapper from "./FeaturesFormsWrapper";

export {
  AbzweigdoseForm,
  LeitungForm,
  LeuchteForm,
  StandortForm,
  MauerlascheForm,
  SchaltstelleForm,
  FeaturesFormsWrapper,
};

export const featureFormRegistry: Record<string, React.ComponentType<any>> = {
  abzweigdose: AbzweigdoseForm,
  leitung: LeitungForm,
  leuchte: LeuchteForm,
  standort: StandortForm,
  mauerlasche: MauerlascheForm,
  schaltstelle: SchaltstelleForm,
};
