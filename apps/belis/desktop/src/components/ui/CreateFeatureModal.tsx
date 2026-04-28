import { Modal, Button } from "antd";
import type { CreateFeatureType } from "../../contexts/MapPageContext";
import { FeatureIcon } from "./CreateFeatureDropdown";
import LeuchteFormFields from "./featuresForm/LeuchteFormFields";
import MastFormFields from "./featuresForm/MastFormFields";
import LeitungFormFields from "./featuresForm/LeitungFormFields";
import SchaltstelleFormFields from "./featuresForm/SchaltstelleFormFields";
import MauerlascheFormFields from "./featuresForm/MauerlascheFormFields";

const featureLabels: Record<string, string> = {
  leuchte: "Leuchte",
  standort: "Standort / Mast",
  leitung: "Leitung",
  schaltstelle: "Schaltstelle",
  mauerlasche: "Mauerlasche",
  abzweigdose: "Abzweigdose",
};

interface CreateFeatureModalProps {
  featureType: CreateFeatureType;
  onClose: () => void;
}

const CreateFeatureModal = ({
  featureType,
  onClose,
}: CreateFeatureModalProps) => {
  const label = featureType ? featureLabels[featureType] : "";

  const renderFields = () => {
    switch (featureType) {
      case "leuchte":
        return <LeuchteFormFields leuchte={null} readOnly={false} />;
      case "standort":
        return <MastFormFields mast={null} readOnly={false} />;
      case "leitung":
        return <LeitungFormFields leitung={null} readOnly={false} />;
      case "schaltstelle":
        return <SchaltstelleFormFields schaltstelle={null} readOnly={false} />;
      case "mauerlasche":
        return <MauerlascheFormFields mauerlasche={null} readOnly={false} />;
      case "abzweigdose":
        return (
          <div className="text-gray-400 py-8 text-center">
            Keine Formularfelder verfügbar
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <Modal
      title={
        <div className="flex items-center gap-2">
          {featureType && <FeatureIcon type={featureType} />}
          <span>{label} anlegen</span>
        </div>
      }
      open={featureType !== null}
      onCancel={onClose}
      centered
      width={600}
      footer={
        <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
          <Button onClick={onClose}>Abbrechen</Button>
          <Button type="primary" onClick={onClose}>
            Erstellen
          </Button>
        </div>
      }
      styles={{
        body: { paddingTop: 16, maxHeight: "70vh", overflowY: "auto" },
        header: { borderBottom: "1px solid #f3f4f6", paddingBottom: 16 },
      }}
    >
      {renderFields()}
    </Modal>
  );
};

export default CreateFeatureModal;
