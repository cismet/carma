import { useState, useEffect, useCallback, useRef } from "react";
import type { FormInstance } from "antd";
import { message } from "antd";
import type { DraftFile } from "../../../store/slices/featuresForms";
import { useSelector } from "react-redux";
import { getJWT } from "../../../store/slices/auth";
import { DokumentItem } from "../DocumentPreview";
import { getDocumentKey } from "../FilePreview";
import FeatureFormLayout from "./FeatureFormLayout";
import LeuchteFormFields from "./LeuchteFormFields";
import MastFormFields from "./MastFormFields";
import {
  fetchFeatureById,
  updateDataByClassName,
} from "../../../helper/apiMethods";
import { uploadDraftFiles } from "../../../helper/uploadDraftFiles";
import dayjs from "dayjs";

const transformDatesForBackend = (
  values: Record<string, unknown>
): Record<string, unknown> => {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(values)) {
    if (dayjs.isDayjs(value)) {
      result[key] = value.toISOString();
    } else {
      result[key] = value;
    }
  }
  return result;
};

interface LeuchteFormProps {
  data: Record<string, unknown> | null;
  rawFeature?: { properties?: Record<string, unknown> } | null;
  onClose?: () => void;
  readOnly?: boolean;
  loading?: boolean;
  draftValues?: Record<string, unknown>;
  draftFiles?: DraftFile[];
  hasDraft?: boolean;
  onDraftChange?: (values: Record<string, unknown>) => void;
  onDraftFilesChange?: (files: DraftFile[]) => void;
  onOriginalValues?: (values: Record<string, unknown>) => void;
  onToggleReadOnly?: () => void;
  onCancel?: () => void;
  onSaveComplete?: () => void;
}

const LeuchteForm = ({
  data,
  rawFeature,
  onClose,
  readOnly = true,
  loading,
  draftValues,
  draftFiles,
  hasDraft,
  onDraftChange,
  onDraftFilesChange,
  onOriginalValues,
  onToggleReadOnly,
  onCancel,
  onSaveComplete,
}: LeuchteFormProps) => {
  const [saving, setSaving] = useState(false);
  const [localDocuments, setLocalDocuments] = useState<DokumentItem[] | null>(
    null
  );
  const [removedDocumentKeys, setRemovedDocumentKeys] = useState<Set<string>>(
    new Set()
  );
  const leuchteFormRef = useRef<FormInstance | null>(null);
  const mastFormRef = useRef<FormInstance | null>(null);

  const setLeuchteForm = useCallback((form: FormInstance) => {
    leuchteFormRef.current = form;
  }, []);
  const setMastForm = useCallback((form: FormInstance) => {
    mastFormRef.current = form;
  }, []);

  const originalValuesRef = useRef<Record<string, unknown>>({});

  const handleLeuchteOriginalValues = useCallback(
    (values: Record<string, unknown>) => {
      originalValuesRef.current = {
        ...originalValuesRef.current,
        leuchte: values,
      };
      onOriginalValues?.(originalValuesRef.current);
    },
    [onOriginalValues]
  );

  const handleMastOriginalValues = useCallback(
    (values: Record<string, unknown>) => {
      originalValuesRef.current = {
        ...originalValuesRef.current,
        mast: values,
      };
      onOriginalValues?.(originalValuesRef.current);
    },
    [onOriginalValues]
  );

  const handleLeuchteValuesChange = useCallback(
    (_: Record<string, unknown>, allValues: Record<string, unknown>) => {
      onDraftChange?.({
        ...draftValues,
        leuchte: allValues,
      });
    },
    [onDraftChange, draftValues]
  );

  const handleMastValuesChange = useCallback(
    (_: Record<string, unknown>, allValues: Record<string, unknown>) => {
      onDraftChange?.({
        ...draftValues,
        mast: allValues,
      });
    },
    [onDraftChange, draftValues]
  );

  const handleSave = async () => {
    if (!jwt) {
      message.error("Nicht authentifiziert");
      return;
    }

    const leuchteId = leuchtenArray?.[0]?.id as number | undefined;
    if (!leuchteId) {
      message.error("Keine Leuchten-ID gefunden");
      return;
    }

    if (!leuchteFormRef.current) {
      return;
    }

    setSaving(true);
    try {
      const formValues = leuchteFormRef.current.getFieldsValue();

      // Remove display-only fields that the backend doesn't expect
      const {
        strassenschluessel_pk,
        strassenschluessel_strasse,
        sonderturnus,
        ...rest
      } = formValues;

      // Upload pending draft files first
      let uploadedDocuments: DokumentItem[] = [];
      if (draftFiles && draftFiles.length > 0) {
        uploadedDocuments = await uploadDraftFiles(jwt, draftFiles);
      }

      // Build final dokumenteArray: existing minus removed, plus newly uploaded
      const hasDocumentChanges =
        uploadedDocuments.length > 0 || removedDocumentKeys.size > 0;
      let finalDokumenteArray: DokumentItem[] | undefined;
      if (hasDocumentChanges) {
        const kept = documents.filter(
          (doc) => !removedDocumentKeys.has(getDocumentKey(doc))
        );
        finalDokumenteArray = [...kept, ...uploadedDocuments];
      }

      const dataToSave = transformDatesForBackend({
        id: leuchteId,
        ...rest,
        // Map form field "sonderturnus" back to server field "wartungszyklus"
        ...(sonderturnus !== undefined ? { wartungszyklus: sonderturnus } : {}),
        // Include updated documents array when changed
        ...(finalDokumenteArray !== undefined
          ? { dokumenteArray: finalDokumenteArray }
          : {}),
      });

      console.log("xxx saving leuchte:", JSON.stringify(dataToSave, null, 2));
      await updateDataByClassName(jwt, "tdta_leuchten", dataToSave);

      // Update local documents so changes appear immediately
      if (hasDocumentChanges && finalDokumenteArray) {
        setLocalDocuments(finalDokumenteArray);
        setRemovedDocumentKeys(new Set());
      }

      message.success("Leuchte gespeichert");
      onSaveComplete?.();
    } catch (error) {
      console.error("Save error:", error);
      message.error(
        error instanceof Error ? error.message : "Fehler beim Speichern"
      );
    } finally {
      setSaving(false);
    }
  };
  const [mastData, setMastData] = useState<Record<string, unknown> | null>(
    null
  );
  const [isMastLoading, setIsMastLoading] = useState(false);
  const jwt = useSelector(getJWT);

  const handleToggleRemoveDocument = useCallback((key: string) => {
    setRemovedDocumentKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }, []);

  // Reset local documents override and removed keys when data changes
  useEffect(() => {
    setLocalDocuments(null);
    setRemovedDocumentKeys(new Set());
  }, [data]);

  // Extract documents from tdta_leuchten[0].dokumenteArray
  const leuchteData = data as Record<string, unknown>;
  const leuchtenArray = leuchteData?.tdta_leuchten as
    | Array<Record<string, unknown>>
    | undefined;
  const serverDocuments: DokumentItem[] =
    (leuchtenArray?.[0]?.dokumenteArray as DokumentItem[]) || [];
  const documents = localDocuments ?? serverDocuments;

  // Extract leuchte object for the form
  const leuchte = leuchtenArray?.[0] || null;

  // Extract tdta_standort_mast id from leuchte
  const standortMast = leuchte?.tdta_standort_mast as
    | Record<string, unknown>
    | undefined;
  const mastId = standortMast?.id as number | undefined;

  // Extra document sections from related entities
  const leuchtenTyp = leuchte?.tkey_leuchtentyp as
    | Record<string, unknown>
    | undefined;
  const leuchtenTypDocuments =
    (leuchtenTyp?.dokumenteArray as DokumentItem[]) ?? [];
  const standortMastDocuments =
    (standortMast?.dokumenteArray as DokumentItem[]) ?? [];

  const leuchtenTypTitle = leuchtenTyp?.typenbezeichnung
    ? `Leuchtentyp (${leuchtenTyp.typenbezeichnung as string})`
    : "Leuchtentyp";

  const extraDocumentSections = [
    { title: leuchtenTypTitle, documents: leuchtenTypDocuments },
    // { title: "Mast", documents: standortMastDocuments },
  ];

  // Fetch mast data if mastId exists
  useEffect(() => {
    if (mastId && jwt) {
      setIsMastLoading(true);
      fetchFeatureById(jwt, mastId, "mast")
        .then((result) => {
          const mastArray = result?.tdta_standort_mast as
            | Array<Record<string, unknown>>
            | undefined;
          setMastData(mastArray?.[0] || null);
        })
        .catch((error) => {
          console.error("Failed to fetch mast data:", error);
          setMastData(null);
        })
        .finally(() => {
          setIsMastLoading(false);
        });
    } else {
      setMastData(null);
    }
  }, [mastId, jwt]);

  // Extract fabrikat for subtitle - use rawFeature (vector tile) to match list display
  const rawProps = rawFeature?.properties;
  const subtitle =
    (rawProps?.fabrikat as string) ||
    (rawProps?.leuchttyp_fabrikat as string) ||
    "-ohne Fabrikat-";

  if (!data) {
    return (
      <div className="flex items-center justify-center h-40 text-gray-400">
        Keine Daten ausgewählt
      </div>
    );
  }

  // Build additional tabs - always keep MastFormFields mounted to preserve
  // scroll position. Show loading state via opacity instead of swapping components,
  // so the content height never collapses and the browser doesn't reset scroll.
  // const additionalTabs = [
  //   {
  //     key: "mast",
  //     label: "Mast",
  //     children: (
  //       <div
  //         className={
  //           isMastLoading
  //             ? "opacity-50 pointer-events-none transition-opacity"
  //             : "transition-opacity"
  //         }
  //       >
  //         <MastFormFields
  //           mast={mastData}
  //           readOnly={readOnly}
  //           onFormInstance={setMastForm}
  //           draftValues={
  //             draftValues?.mast as Record<string, unknown> | undefined
  //           }
  //           onValuesChange={handleMastValuesChange}
  //           onOriginalValues={handleMastOriginalValues}
  //         />
  //       </div>
  //     ),
  //   },
  // ];
  const additionalTabs: never[] = [];

  return (
    <FeatureFormLayout
      title="Leuchte"
      subtitle={subtitle}
      documents={documents}
      mainDocumentsTitle="Leuchte"
      extraDocumentSections={extraDocumentSections}
      jwt={jwt}
      draftFiles={draftFiles}
      onDraftFilesChange={onDraftFilesChange}
      removedDocumentKeys={removedDocumentKeys}
      onToggleRemoveDocument={handleToggleRemoveDocument}
      debugData={data}
      additionalTabs={additionalTabs}
      loading={loading}
      saving={saving}
      readOnly={readOnly}
      hasDraft={hasDraft || removedDocumentKeys.size > 0}
      onToggleReadOnly={onToggleReadOnly}
      onCancel={onCancel}
      onSave={handleSave}
    >
      <LeuchteFormFields
        leuchte={leuchte}
        readOnly={readOnly}
        onFormInstance={setLeuchteForm}
        draftValues={
          draftValues?.leuchte as Record<string, unknown> | undefined
        }
        onValuesChange={handleLeuchteValuesChange}
        onOriginalValues={handleLeuchteOriginalValues}
      />
    </FeatureFormLayout>
  );
};

export default LeuchteForm;
