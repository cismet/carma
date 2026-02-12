import { useState } from "react";
import type { UploadFile } from "antd";
import { useSelector } from "react-redux";
import { getJWT } from "../../../store/slices/auth";
import { DokumentItem } from "../DocumentPreview";
import FeatureFormLayout from "./FeatureFormLayout";
import MastFormFields from "./MastFormFields";

interface MastFormProps {
  data: Record<string, unknown> | null;
  rawFeature?: { properties?: Record<string, unknown> } | null;
  onClose?: () => void;
}

const MastForm = ({ data, rawFeature, onClose }: MastFormProps) => {
  const [pendingFiles, setPendingFiles] = useState<UploadFile[]>([]);
  const jwt = useSelector(getJWT);

  // Extract documents from tdta_standort_mast[0].dokumenteArray
  const mastData = data as Record<string, unknown>;
  const mastArray = mastData?.tdta_standort_mast as
    | Array<Record<string, unknown>>
    | undefined;
  const documents: DokumentItem[] =
    (mastArray?.[0]?.dokumenteArray as DokumentItem[]) || [];

  // Extract mast object for the form
  const mast = mastArray?.[0] || null;

  // Extract subtitle - use rawFeature (vector tile) to match list display
  const rawProps = rawFeature?.properties as
    | Record<string, unknown>
    | undefined;
  const strassenschluessel = rawProps?.fk_strassenschluessel as
    | { strasse?: string }
    | undefined;
  const subtitle =
    strassenschluessel?.strasse ||
    (rawProps?.strasse as string) ||
    (rawProps?.standortangabe as string) ||
    "-ohne Straße-";

  if (!data) {
    return (
      <div className="flex items-center justify-center h-40 text-gray-400">
        Keine Daten ausgewählt
      </div>
    );
  }

  return (
    <FeatureFormLayout
      title="Mast"
      subtitle={subtitle}
      documents={documents}
      jwt={jwt}
      pendingFiles={pendingFiles}
      onFilesChange={setPendingFiles}
      debugData={data}
      uploadText="Datei hochladen"
    >
      <MastFormFields mast={mast} />
    </FeatureFormLayout>
  );
};

export default MastForm;
