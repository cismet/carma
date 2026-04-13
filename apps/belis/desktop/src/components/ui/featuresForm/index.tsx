import AbzweigdoseForm from "./AbzweigdoseForm";
import LeitungForm from "./LeitungForm";
import LeuchteForm from "./LeuchteForm";
import StandortForm from "./StandortForm";
import MauerlascheForm from "./MauerlascheForm";
import SchaltstelleForm from "./SchaltstelleForm";
import FeaturesFormsWrapper from "./FeaturesFormsWrapper";
import ArbeitsauftragForm from "./ArbeitsauftragForm";
import ArbeitsprotokollForm from "./ArbeitsprotokollForm";

export {
  AbzweigdoseForm,
  LeitungForm,
  LeuchteForm,
  StandortForm,
  MauerlascheForm,
  SchaltstelleForm,
  FeaturesFormsWrapper,
  ArbeitsauftragForm,
  ArbeitsprotokollForm,
};

export const featureFormRegistry: Record<string, React.ComponentType<any>> = {
  abzweigdose: AbzweigdoseForm,
  leitung: LeitungForm,
  leuchte: LeuchteForm,
  standort: StandortForm,
  mauerlasche: MauerlascheForm,
  schaltstelle: SchaltstelleForm,
};
