import { useCallback, useRef, useState } from "react";
import { Modal, Button, message } from "antd";
import type { FormInstance } from "antd";
import { useSelector } from "react-redux";
import proj4 from "proj4";
import { useLibreContext } from "@carma-mapping/engines/maplibre";
import { proj4crs4326def } from "@carma-mapping/utils";
import type { CreateFeatureType } from "../../contexts/MapPageContext";
import { FeatureIcon } from "./CreateFeatureDropdown";
import LeuchteFormFields from "./featuresForm/LeuchteFormFields";
import MastFormFields from "./featuresForm/MastFormFields";
import LeitungFormFields from "./featuresForm/LeitungFormFields";
import SchaltstelleFormFields from "./featuresForm/SchaltstelleFormFields";
import MauerlascheFormFields from "./featuresForm/MauerlascheFormFields";
import { getJWT } from "../../store/slices/auth";
import { prepareSaveValues } from "../../helper/featureFormSaveHelpers";
import { updateDataByClassName, fetchFeatureById } from "../../helper/apiMethods";

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

const proj4crs25832def =
  "+proj=utm +zone=32 +ellps=GRS80 +units=m +no_defs";

const CRS_25832 = {
  type: "name" as const,
  properties: { name: "urn:ogc:def:crs:EPSG::25832" },
};

// Temporary hardcoded geometries near Toelleturm, Wuppertal-Barmen (EPSG:25832)
// Used as placeholder until real drawing/pick-from-map is implemented
const HARDCODED_POINT = {
  type: "Point" as const,
  crs: CRS_25832,
  coordinates: [374503.93, 5679879.30],
};

const HARDCODED_POINT_TOELLETURM = {
  type: "Point" as const,
  crs: CRS_25832,
  coordinates: [374503.93, 5679879.30],
};

const HARDCODED_LINE = {
  type: "LineString" as const,
  crs: CRS_25832,
  coordinates: [
    [374503.93, 5679879.30],
    [374523.93, 5679899.30],
    [374543.93, 5679919.30],
  ],
};

const buildGeom = (featureType: string) => {
  if (featureType === "leitung") return { id: -1, geo_field: HARDCODED_LINE };
  if (featureType === "leuchte") return { id: -1, geo_field: HARDCODED_POINT_TOELLETURM };
  return { id: -1, geo_field: HARDCODED_POINT };
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
  const { map } = useLibreContext();
  const formRef = useRef<FormInstance | null>(null);
  const [saving, setSaving] = useState(false);

  const handleFlyToGeom = useCallback(() => {
    if (!featureType || !map) return;
    const geom = buildGeom(featureType).geo_field;
    const coords =
      geom.type === "Point" ? geom.coordinates : geom.coordinates[0];
    const [lng, lat] = proj4(proj4crs25832def, proj4crs4326def, coords as [number, number]);
    map.flyTo({ center: [lng, lat], zoom: 18 });
  }, [featureType, map]);

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

    setSaving(true);
    try {
      let payload: Record<string, unknown>;

      if (featureType === "leuchte") {
        // Step 1: create a Standort/Mast with geometry
        const mastPayload = {
          id: -1,
          geom: buildGeom("standort"),
        };
        console.log(
          "[CreateFeature] step 1 — creating Standort:",
          JSON.stringify(mastPayload, null, 2)
        );
        const mastResult = await updateDataByClassName(
          jwt,
          classNames["standort"],
          mastPayload
        );
        console.log("[CreateFeature] Standort response:", mastResult);

        const mastRes = mastResult as { res?: string } | null;
        const parsedMast = mastRes?.res
          ? (JSON.parse(mastRes.res) as { id?: number })
          : null;
        const newMastId = parsedMast?.id;

        if (!newMastId) {
          throw new Error("Standort erstellt, aber keine ID erhalten");
        }

        // Step 2: create Leuchte referencing the new Standort
        payload = {
          id: -1,
          ...prepared,
          fk_standort: newMastId,
        };
        console.log(
          "[CreateFeature] step 2 — creating Leuchte:",
          JSON.stringify(payload, null, 2)
        );
      } else {
        payload = {
          id: -1,
          ...prepared,
          geom: buildGeom(featureType),
        };
        console.log(
          "[CreateFeature] payload:",
          JSON.stringify(payload, null, 2)
        );
      }

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
        <div className="flex justify-between pt-2 border-t border-gray-100">
          <div className="flex gap-2">
            <Button onClick={handleFlyToGeom}>
              Zur Geometrie fliegen
            </Button>
            <Button
              onClick={async () => {
                if (!jwt) return;
                const data = await fetchFeatureById(jwt, 90, "mast");
                console.log("[TestFetch] Mast 90:", JSON.stringify(data, null, 2));
              }}
            >
              Test Fetch Mast 90
            </Button>
          </div>
          <div className="flex gap-2">
            <Button onClick={handleCancel} disabled={saving}>
              Abbrechen
            </Button>
            <Button type="primary" onClick={handleCreate} loading={saving}>
              Erstellen
            </Button>
          </div>
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
