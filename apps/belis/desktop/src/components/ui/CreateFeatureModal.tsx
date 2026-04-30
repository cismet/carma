import { useCallback, useMemo, useRef, useState } from "react";
import { Modal, Button, message, Tabs, Select, Form } from "antd";
import { useSelector, useDispatch } from "react-redux";
import proj4 from "proj4";
import { useLibreContext } from "@carma-mapping/engines/maplibre";
import { proj4crs4326def } from "@carma-mapping/utils";
import type { CreateFeatureType } from "../../contexts/MapPageContext";
import { FeatureIcon } from "./CreateFeatureDropdown";
import FilePreview from "./FilePreview";
import type { PendingUpload } from "./FilePreview";
import LeuchteFormFields from "./featuresForm/LeuchteFormFields";
import MastFormFields from "./featuresForm/MastFormFields";
import LeitungFormFields from "./featuresForm/LeitungFormFields";
import SchaltstelleFormFields from "./featuresForm/SchaltstelleFormFields";
import MauerlascheFormFields from "./featuresForm/MauerlascheFormFields";
import { getJWT } from "../../store/slices/auth";
import { prepareSaveValues } from "../../helper/featureFormSaveHelpers";
import { updateDataByClassName, fileToBase64 } from "../../helper/apiMethods";
import { uploadDraftFiles } from "../../helper/uploadDraftFiles";
import {
  setDraft,
  removeDraft,
  setDraftFiles as setDraftFilesAction,
  getDraft,
} from "../../store/slices/featuresForms";
import type { DraftFile } from "../../store/slices/featuresForms";
import type { RootState } from "../../store";
import {
  buildSyntheticFeature,
  buildSyntheticFetchedData,
} from "../../helper/buildSyntheticFeature";
import {
  serializeValues,
  deserializeValues,
} from "../../helper/draftSerialize";

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

const proj4crs25832def = "+proj=utm +zone=32 +ellps=GRS80 +units=m +no_defs";

const CRS_25832 = {
  type: "name" as const,
  properties: { name: "urn:ogc:def:crs:EPSG::25832" },
};

const HARDCODED_POINT_TOELLETURM = {
  type: "Point" as const,
  crs: CRS_25832,
  coordinates: [374503.93, 5679879.3],
};

const HARDCODED_LINE = {
  type: "LineString" as const,
  crs: CRS_25832,
  coordinates: [
    [374503.93, 5679879.3],
    [374523.93, 5679899.3],
    [374543.93, 5679919.3],
  ],
};

type GeometryKey = "point_toelleturm" | "line";

const GEOMETRY_OPTIONS: {
  key: GeometryKey;
  label: string;
  geometry: typeof HARDCODED_POINT_TOELLETURM | typeof HARDCODED_LINE;
}[] = [
  {
    key: "point_toelleturm",
    label: "Point - Toelleturm",
    geometry: HARDCODED_POINT_TOELLETURM,
  },
  {
    key: "line",
    label: "Line - Toelleturm",
    geometry: HARDCODED_LINE,
  },
];

const getGeometryByKey = (key: GeometryKey) =>
  GEOMETRY_OPTIONS.find((o) => o.key === key)!.geometry;

const getDefaultGeometryKey = (featureType: string): GeometryKey =>
  featureType === "leitung" ? "line" : "point_toelleturm";

interface CreateFeatureModalProps {
  featureType: CreateFeatureType;
  onClose: () => void;
  resumeDraftKey?: string;
}

const CreateFeatureModal = ({
  featureType,
  onClose,
  resumeDraftKey,
}: CreateFeatureModalProps) => {
  const label = featureType ? featureLabels[featureType] : "";
  const jwt = useSelector(getJWT) as string | null;
  const { map } = useLibreContext();
  const [form] = Form.useForm();
  const dispatch = useDispatch();
  const [saving, setSaving] = useState(false);

  const generatedKeyRef = useRef<string | null>(null);
  const prevFeatureTypeRef = useRef(featureType);

  if (featureType !== prevFeatureTypeRef.current) {
    prevFeatureTypeRef.current = featureType;
    generatedKeyRef.current = null;
  }

  let draftKey: string | null = null;
  if (featureType) {
    if (resumeDraftKey) {
      draftKey = resumeDraftKey;
    } else {
      if (!generatedKeyRef.current) {
        generatedKeyRef.current = `create:${featureType}:${Date.now()}-${Math.random()
          .toString(36)
          .slice(2, 9)}`;
      }
      draftKey = generatedKeyRef.current;
    }
  }

  const draft = useSelector((state: RootState) =>
    getDraft(state, draftKey ?? undefined)
  );
  const draftFiles = draft?.files ?? [];

  const draftValues = useMemo(
    () => (draft?.values ? deserializeValues(draft.values) : undefined),
    [draft?.values]
  );

  const [selectedGeomKey, setSelectedGeomKey] = useState<GeometryKey>(
    getDefaultGeometryKey(featureType)
  );

  const prevDraftKeyRef = useRef<string | null>(null);
  if (draftKey !== prevDraftKeyRef.current) {
    prevDraftKeyRef.current = draftKey;
    const restored = draft?.geometryKey as GeometryKey | undefined;
    const next = restored ?? getDefaultGeometryKey(featureType);
    if (next !== selectedGeomKey) {
      setSelectedGeomKey(next);
    }
    if (draftValues && Object.keys(draftValues).length > 0) {
      form.setFieldsValue(draftValues);
    } else {
      form.resetFields();
    }
  }

  const pendingUploads: PendingUpload[] = useMemo(
    () =>
      draftFiles.map((df) => ({
        id: df.id,
        fileName: df.fileName,
        previewUrl: df.base64Data,
        originalFileName: df.originalFileName,
      })),
    [draftFiles]
  );

  const dispatchDraft = useCallback(
    (values: Record<string, unknown>) => {
      if (!draftKey || !featureType) return;
      const serialized = serializeValues(values);
      const geom = getGeometryByKey(selectedGeomKey);
      dispatch(
        setDraft({
          featureId: draftKey,
          featureType,
          values: serialized,
          feature: buildSyntheticFeature(featureType, draftKey, values, geom),
          fetchedData: buildSyntheticFetchedData(featureType, values),
          isCreation: true,
          geometry: geom,
          geometryKey: selectedGeomKey,
        })
      );
    },
    [draftKey, featureType, selectedGeomKey, dispatch]
  );

  const handleValuesChange = useCallback(
    (_changed: Record<string, unknown>, allValues: Record<string, unknown>) => {
      dispatchDraft(allValues);
    },
    [dispatchDraft]
  );

  const handleAddFiles = useCallback(
    async (files: File[]) => {
      if (!draftKey || !featureType) return;
      const newDraftFiles: DraftFile[] = await Promise.all(
        files.map(async (file) => {
          const dotIdx = file.name.lastIndexOf(".");
          const nameNoExt = dotIdx > 0 ? file.name.slice(0, dotIdx) : file.name;
          return {
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
            fileName: nameNoExt,
            originalFileName: file.name,
            base64Data: await fileToBase64(file),
            mimeType: file.type,
            size: file.size,
          };
        })
      );
      const updatedFiles = [...draftFiles, ...newDraftFiles];
      const currentValues = form.getFieldsValue() ?? {};
      const geom = getGeometryByKey(selectedGeomKey);
      dispatch(
        setDraftFilesAction({
          featureId: draftKey,
          featureType,
          files: updatedFiles,
          feature: buildSyntheticFeature(
            featureType,
            draftKey,
            currentValues,
            geom
          ),
          fetchedData: buildSyntheticFetchedData(featureType, currentValues),
        })
      );
    },
    [draftKey, featureType, draftFiles, selectedGeomKey, dispatch]
  );

  const handleRemoveFile = useCallback(
    (id: string) => {
      if (!draftKey || !featureType) return;
      const updatedFiles = draftFiles.filter((f) => f.id !== id);
      const currentValues = form.getFieldsValue() ?? {};
      const geom = getGeometryByKey(selectedGeomKey);
      dispatch(
        setDraftFilesAction({
          featureId: draftKey,
          featureType,
          files: updatedFiles,
          feature: buildSyntheticFeature(
            featureType,
            draftKey,
            currentValues,
            geom
          ),
          fetchedData: buildSyntheticFetchedData(featureType, currentValues),
        })
      );
    },
    [draftKey, featureType, draftFiles, selectedGeomKey, dispatch]
  );

  const handleGeomKeyChange = useCallback(
    (newKey: GeometryKey) => {
      setSelectedGeomKey(newKey);
      if (!draftKey || !featureType) return;
      const currentValues = form.getFieldsValue() ?? {};
      const serialized = serializeValues(currentValues);
      const geom = getGeometryByKey(newKey);
      dispatch(
        setDraft({
          featureId: draftKey,
          featureType,
          values: serialized,
          feature: buildSyntheticFeature(
            featureType,
            draftKey,
            currentValues,
            geom
          ),
          fetchedData: buildSyntheticFetchedData(featureType, currentValues),
          isCreation: true,
          geometry: geom,
          geometryKey: newKey,
        })
      );
    },
    [draftKey, featureType, dispatch]
  );

  const handleFlyToGeom = useCallback(() => {
    if (!featureType || !map) return;
    const geom = getGeometryByKey(selectedGeomKey);
    const coords =
      geom.type === "Point" ? geom.coordinates : geom.coordinates[0];
    const [lng, lat] = proj4(
      proj4crs25832def,
      proj4crs4326def,
      coords as [number, number]
    );
    map.flyTo({ center: [lng, lat], zoom: 18 });
  }, [featureType, selectedGeomKey, map]);

  const handleCreate = useCallback(() => {
    if (!featureType) return;

    void message.success(`${label} als Entwurf gespeichert`);
    form.resetFields();
    onClose();

    // --- server save logic (commented out for now) ---
    // if (!jwt) return;
    //
    // const className = classNames[featureType];
    // if (!className) return;
    //
    // const rawValues = form.getFieldsValue() ?? {};
    //
    // const valuesForPrepare =
    //   featureType === "leuchte" ? { leuchte: rawValues } : rawValues;
    // const prepared = prepareSaveValues(featureType, valuesForPrepare) ?? {};
    //
    // setSaving(true);
    // try {
    //   let payload: Record<string, unknown>;
    //
    //   if (featureType === "leuchte") {
    //     const mastPayload = {
    //       id: -1,
    //       geom: buildGeom("standort"),
    //     };
    //     const mastResult = await updateDataByClassName(
    //       jwt,
    //       classNames["standort"],
    //       mastPayload
    //     );
    //
    //     const mastRes = mastResult as { res?: string } | null;
    //     const parsedMast = mastRes?.res
    //       ? (JSON.parse(mastRes.res) as { id?: number })
    //       : null;
    //     const newMastId = parsedMast?.id;
    //
    //     if (!newMastId) {
    //       throw new Error("Standort erstellt, aber keine ID erhalten");
    //     }
    //
    //     payload = {
    //       id: -1,
    //       ...prepared,
    //       tdta_standort_mast: { id: Number(newMastId) },
    //     };
    //   } else {
    //     payload = {
    //       id: -1,
    //       ...prepared,
    //       geom: buildGeom(featureType),
    //     };
    //   }
    //
    //   const result = await updateDataByClassName(jwt, className, payload);
    //
    //   if (draftFiles.length > 0) {
    //     const res = result as { res?: string } | null;
    //     const parsed = res?.res
    //       ? (JSON.parse(res.res) as { id?: number })
    //       : null;
    //     const newId = parsed?.id;
    //
    //     if (newId) {
    //       const uploadedDocs = await uploadDraftFiles(jwt, draftFiles);
    //       if (uploadedDocs.length > 0) {
    //         await updateDataByClassName(jwt, className, {
    //           id: newId,
    //           dokumenteArray: uploadedDocs,
    //         });
    //       }
    //     }
    //   }
    //
    //   void message.success(`${label} erstellt`);
    //   if (draftKey) {
    //     dispatch(removeDraft(draftKey));
    //   }
    //   form.resetFields();
    //   onClose();
    // } catch (err) {
    //   console.error("[CreateFeature] error:", err);
    //   void message.error(
    //     `Fehler beim Erstellen: ${
    //       err instanceof Error ? err.message : "Unbekannter Fehler"
    //     }`
    //   );
    // } finally {
    //   setSaving(false);
    // }
  }, [featureType, label, onClose]);

  const handleClose = () => {
    onClose();
  };

  const handleCancel = () => {
    if (draftKey) {
      dispatch(removeDraft(draftKey));
    }
    form.resetFields();
    onClose();
  };

  const renderFields = () => {
    switch (featureType) {
      case "leuchte":
        return (
          <LeuchteFormFields
            leuchte={null}
            readOnly={false}
            form={form}
            onValuesChange={handleValuesChange}
          />
        );
      case "standort":
        return (
          <MastFormFields
            mast={null}
            readOnly={false}
            form={form}
            onValuesChange={handleValuesChange}
          />
        );
      case "leitung":
        return (
          <LeitungFormFields
            leitung={null}
            readOnly={false}
            form={form}
            onValuesChange={handleValuesChange}
          />
        );
      case "schaltstelle":
        return (
          <SchaltstelleFormFields
            schaltstelle={null}
            readOnly={false}
            form={form}
            onValuesChange={handleValuesChange}
          />
        );
      case "mauerlasche":
        return (
          <MauerlascheFormFields
            mauerlasche={null}
            readOnly={false}
            form={form}
            onValuesChange={handleValuesChange}
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
      onCancel={handleClose}
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
        body: { paddingTop: 16, height: "70vh", overflowY: "hidden" },
        header: { borderBottom: "1px solid #f3f4f6", paddingBottom: 16 },
      }}
    >
      <div className="mb-4">
        <span className="text-sm font-medium text-gray-700">Geometrie</span>
        <Select
          value={selectedGeomKey}
          onChange={handleGeomKeyChange}
          className="w-full mt-1"
          size="large"
        >
          {GEOMETRY_OPTIONS.map((opt) => (
            <Select.Option key={opt.key} value={opt.key}>
              {opt.label}
            </Select.Option>
          ))}
        </Select>
      </div>
      <Tabs
        defaultActiveKey="allgemein"
        className="h-full flex flex-col [&_.ant-tabs-content-holder]:flex-1 [&_.ant-tabs-content-holder]:overflow-hidden [&_.ant-tabs-content]:h-full [&_.ant-tabs-tabpane]:h-full [&_.ant-tabs-tabpane]:overflow-y-auto"
        items={[
          {
            key: "allgemein",
            label: "Allgemein",
            children: renderFields(),
          },
          {
            key: "dokumente",
            label: `Dokumente${
              draftFiles.length > 0 ? ` (${draftFiles.length})` : ""
            }`,
            children: (
              <div className="pt-2">
                <FilePreview
                  documents={[]}
                  readOnly={false}
                  pendingUploads={pendingUploads}
                  onAddFiles={handleAddFiles}
                  onRemovePendingUpload={handleRemoveFile}
                  onPendingUploadNameChange={() => {}}
                  size="xl"
                />
              </div>
            ),
          },
        ]}
      />
    </Modal>
  );
};

export default CreateFeatureModal;
