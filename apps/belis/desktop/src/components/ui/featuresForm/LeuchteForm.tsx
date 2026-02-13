import { useState, useEffect } from "react";
import type { UploadFile } from "antd";
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
}

const LeuchteForm = ({ data, rawFeature, onClose }: LeuchteFormProps) => {
  const [pendingFiles, setPendingFiles] = useState<UploadFile[]>([]);
  const [mastData, setMastData] = useState<Record<string, unknown> | null>(
    null
  );
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
    | { id?: number }
    | undefined;
  const mastId = standortMast?.id;

  // Fetch mast data if mastId exists
  useEffect(() => {
    if (mastId && jwt) {
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

  // Build additional tabs - add Mast tab if mast data is available
  const additionalTabs = mastData
    ? [
        {
          key: "mast",
          label: "Mast",
          children: <MastFormFields mast={mastData} />,
        },
      ]
    : [];

  return (
    <FeatureFormLayout
      title="Leuchte"
      subtitle={subtitle}
      documents={documents}
      jwt={jwt}
      pendingFiles={pendingFiles}
      onFilesChange={setPendingFiles}
      debugData={data}
      additionalTabs={additionalTabs}
    >
      <LeuchteFormFields leuchte={leuchte} />
    </FeatureFormLayout>
  );
};

export default LeuchteForm;
