import { useState, useEffect, useCallback, useRef } from "react";
import type { UploadFile, FormInstance } from "antd";
import { useSelector } from "react-redux";
import { getJWT } from "../../../store/slices/auth";
import { DokumentItem } from "../DocumentPreview";
import FeatureFormLayout from "./FeatureFormLayout";
import LeuchteFormFields from "./LeuchteFormFields";
import MastFormFields from "./MastFormFields";
import { fetchFeatureById } from "../../../helper/apiMethods";

interface LeuchteFormProps {
  data: Record<string, unknown> | null;
  rawFeature?: { properties?: Record<string, unknown> } | null;
  onClose?: () => void;
  readOnly?: boolean;
  loading?: boolean;
  draftValues?: Record<string, unknown>;
  hasDraft?: boolean;
  onDraftChange?: (values: Record<string, unknown>) => void;
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
  hasDraft,
  onDraftChange,
  onOriginalValues,
  onToggleReadOnly,
  onCancel,
  onSaveComplete,
}: LeuchteFormProps) => {
  const [pendingFiles, setPendingFiles] = useState<UploadFile[]>([]);
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
      originalValuesRef.current = { ...originalValuesRef.current, leuchte: values };
      onOriginalValues?.(originalValuesRef.current);
    },
    [onOriginalValues]
  );

  const handleMastOriginalValues = useCallback(
    (values: Record<string, unknown>) => {
      originalValuesRef.current = { ...originalValuesRef.current, mast: values };
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

  const handleSave = () => {
    const values: Record<string, unknown> = {};
    if (leuchteFormRef.current) {
      values.leuchte = leuchteFormRef.current.getFieldsValue();
    }
    if (mastFormRef.current) {
      values.mast = mastFormRef.current.getFieldsValue();
    }
    console.log("Leuchte form values:", values);
    onSaveComplete?.();
  };
  const [mastData, setMastData] = useState<Record<string, unknown> | null>(
    null
  );
  const [isMastLoading, setIsMastLoading] = useState(false);
  const jwt = useSelector(getJWT);

  // Extract documents from tdta_leuchten[0].dokumenteArray
  const leuchteData = data as Record<string, unknown>;
  const leuchtenArray = leuchteData?.tdta_leuchten as
    | Array<Record<string, unknown>>
    | undefined;
  const documents: DokumentItem[] =
    (leuchtenArray?.[0]?.dokumenteArray as DokumentItem[]) || [];

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
    { title: "Mast", documents: standortMastDocuments },
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
  const additionalTabs = [
    {
      key: "mast",
      label: "Mast",
      children: (
        <div
          className={
            isMastLoading
              ? "opacity-50 pointer-events-none transition-opacity"
              : "transition-opacity"
          }
        >
          <MastFormFields
            mast={mastData}
            readOnly={readOnly}
            onFormInstance={setMastForm}
            draftValues={draftValues?.mast as Record<string, unknown> | undefined}
            onValuesChange={handleMastValuesChange}
            onOriginalValues={handleMastOriginalValues}
          />
        </div>
      ),
    },
  ];

  return (
    <FeatureFormLayout
      title="Leuchte"
      subtitle={subtitle}
      documents={documents}
      mainDocumentsTitle="Leuchte"
      extraDocumentSections={extraDocumentSections}
      jwt={jwt}
      pendingFiles={pendingFiles}
      onFilesChange={setPendingFiles}
      debugData={data}
      additionalTabs={additionalTabs}
      loading={loading}
      readOnly={readOnly}
      hasDraft={hasDraft}
      onToggleReadOnly={onToggleReadOnly}
      onCancel={onCancel}
      onSave={handleSave}
    >
      <LeuchteFormFields
        leuchte={leuchte}
        readOnly={readOnly}
        onFormInstance={setLeuchteForm}
        draftValues={draftValues?.leuchte as Record<string, unknown> | undefined}
        onValuesChange={handleLeuchteValuesChange}
        onOriginalValues={handleLeuchteOriginalValues}
      />
    </FeatureFormLayout>
  );
};

export default LeuchteForm;
