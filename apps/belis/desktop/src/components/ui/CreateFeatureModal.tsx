import { useCallback, useRef, useState } from "react";
import { Modal, Button, message } from "antd";
import type { FormInstance } from "antd";
import { useSelector } from "react-redux";
import type { CreateFeatureType } from "../../contexts/MapPageContext";
import { FeatureIcon } from "./CreateFeatureDropdown";
import LeuchteFormFields from "./featuresForm/LeuchteFormFields";
import MastFormFields from "./featuresForm/MastFormFields";
import LeitungFormFields from "./featuresForm/LeitungFormFields";
import SchaltstelleFormFields from "./featuresForm/SchaltstelleFormFields";
import MauerlascheFormFields from "./featuresForm/MauerlascheFormFields";
import { getJWT } from "../../store/slices/auth";
import { prepareSaveValues } from "../../helper/featureFormSaveHelpers";
import { updateDataByClassName } from "../../helper/apiMethods";

const featureLabels: Record<string, string> = {
  leuchte: "Leuchte",
  standort: "Standort / Mast",
  leitung: "Leitung",
  schaltstelle: "Schaltstelle",
  mauerlasche: "Mauerlasche",
  abzweigdose: "Abzweigdose",
};

const classNames: Record<string, string> = {
  leuchte: "tdta_leuchten",
  standort: "tdta_standort_mast",
  leitung: "leitung",
  schaltstelle: "schaltstelle",
  mauerlasche: "mauerlasche",
  abzweigdose: "abzweigdose",
};

const CRS_25832 = {
  type: "name" as const,
  properties: { name: "urn:ogc:def:crs:EPSG::25832" },
};

const HARDCODED_POINT = {
  type: "Point" as const,
  crs: CRS_25832,
  coordinates: [370693.99, 5679839.69],
};

const HARDCODED_LINE = {
  type: "LineString" as const,
  crs: CRS_25832,
  coordinates: [
    [370693.99, 5679839.69],
    [370713.99, 5679859.69],
    [370733.99, 5679879.69],
  ],
};

const buildGeom = (featureType: string) => {
  const geoField = featureType === "leitung" ? HARDCODED_LINE : HARDCODED_POINT;
  return { id: -1, geo_field: geoField };
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
  const jwt = useSelector(getJWT) as string | null;
  const formRef = useRef<FormInstance | null>(null);
  const [saving, setSaving] = useState(false);

  const handleFormInstance = useCallback((form: FormInstance) => {
    formRef.current = form;
  }, []);

  const handleCreate = useCallback(async () => {
    if (!featureType || !jwt) return;

    const className = classNames[featureType];
    if (!className) return;

    const rawValues = formRef.current?.getFieldsValue() ?? {};
    console.log(
      "[CreateFeature] rawValues:",
      JSON.stringify(rawValues, null, 2)
    );

    const prepared = prepareSaveValues(featureType, rawValues) ?? {};
    console.log(
      "[CreateFeature] prepared:",
      JSON.stringify(prepared, null, 2)
    );

    const payload: Record<string, unknown> = {
      id: -1,
      ...prepared,
      geom: buildGeom(featureType),
    };

    console.log(
      "[CreateFeature] payload:",
      JSON.stringify(payload, null, 2)
    );

    setSaving(true);
    try {
      const result = await updateDataByClassName(jwt, className, payload);
      console.log("[CreateFeature] server response:", result);
      void message.success(`${label} erstellt`);
      formRef.current?.resetFields();
      onClose();
    } catch (err) {
      console.error("[CreateFeature] error:", err);
      void message.error(`Fehler beim Erstellen: ${err instanceof Error ? err.message : "Unbekannter Fehler"}`);
    } finally {
      setSaving(false);
    }
  }, [featureType, jwt, label, onClose]);

  const handleCancel = () => {
    formRef.current?.resetFields();
    onClose();
  };

  const renderFields = () => {
    switch (featureType) {
      case "leuchte":
        return (
          <LeuchteFormFields
            leuchte={null}
            readOnly={false}
            onFormInstance={handleFormInstance}
          />
        );
      case "standort":
        return (
          <MastFormFields
            mast={null}
            readOnly={false}
            onFormInstance={handleFormInstance}
          />
        );
      case "leitung":
        return (
          <LeitungFormFields
            leitung={null}
            readOnly={false}
            onFormInstance={handleFormInstance}
          />
        );
      case "schaltstelle":
        return (
          <SchaltstelleFormFields
            schaltstelle={null}
            readOnly={false}
            onFormInstance={handleFormInstance}
          />
        );
      case "mauerlasche":
        return (
          <MauerlascheFormFields
            mauerlasche={null}
            readOnly={false}
            onFormInstance={handleFormInstance}
          />
        );
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
      onCancel={handleCancel}
      centered
      width={600}
      footer={
        <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
          <Button onClick={handleCancel} disabled={saving}>
            Abbrechen
          </Button>
          <Button type="primary" onClick={handleCreate} loading={saving}>
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
