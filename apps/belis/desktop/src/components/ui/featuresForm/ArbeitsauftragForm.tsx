import { useMemo } from "react";
import { useSelector } from "react-redux";
import FeatureFormLayout from "./FeatureFormLayout";
import ArbeitsauftragFormFields from "./ArbeitsauftragFormFields";
import type { DokumentItem } from "../DocumentPreview";
import { getJWT } from "../../../store/slices/auth";

interface ArbeitsauftragFormProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: Record<string, any>;
  loading?: boolean;
  readOnly?: boolean;
  onToggleReadOnly?: () => void;
  onCancel?: () => void;
  onSave?: () => void;
  hasDraft?: boolean;
  onFormInstance?: (form: import("antd").FormInstance) => void;
  draftValues?: Record<string, unknown>;
  onValuesChange?: (
    changedValues: Record<string, unknown>,
    allValues: Record<string, unknown>
  ) => void;
  onOriginalValues?: (values: Record<string, unknown>) => void;
  customDraftsCount?: number;
  onSaveAll?: () => void;
}

const ArbeitsauftragForm = ({
  data,
  loading,
  readOnly = true,
  onToggleReadOnly,
  onCancel,
  onSave,
  hasDraft,
  onFormInstance,
  draftValues,
  onValuesChange,
  onOriginalValues,
  customDraftsCount,
  onSaveAll,
}: ArbeitsauftragFormProps) => {
  const jwt = useSelector(getJWT);

  // Collect documents from all protocols' veranlassung.ar_dokumenteArray
  const documents: DokumentItem[] = useMemo(() => {
    if (!data?.ar_protokolleArray) return [];

    const docs: DokumentItem[] = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const entry of data.ar_protokolleArray as Record<string, any>[]) {
      const protokoll = entry.arbeitsprotokoll;
      if (!protokoll?.veranlassung?.ar_dokumenteArray) continue;
      for (const doc of protokoll.veranlassung.ar_dokumenteArray) {
        if (doc?.dms_url) {
          docs.push(doc as DokumentItem);
        }
      }
    }
    return docs;
  }, [data]);

  const subtitle = data.nummer ? `AA-${data.nummer}` : "";

  return (
    <FeatureFormLayout
      title="Arbeitsauftrag"
      subtitle={subtitle}
      documents={documents}
      jwt={jwt}
      sideContent={""}
      debugData={data}
      loading={loading}
      readOnly={readOnly}
      onToggleReadOnly={onToggleReadOnly}
      onCancel={onCancel}
      onSave={onSave}
      hasDraft={hasDraft}
      customDraftsCount={customDraftsCount}
      onSaveAll={onSaveAll}
    >
      <ArbeitsauftragFormFields
        data={data}
        readOnly={readOnly}
        onFormInstance={onFormInstance}
        draftValues={draftValues}
        onValuesChange={onValuesChange}
        onOriginalValues={onOriginalValues}
      />
    </FeatureFormLayout>
  );
};

export default ArbeitsauftragForm;
