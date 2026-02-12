import { useState } from "react";
import type { UploadFile } from "antd";
import { useSelector } from "react-redux";
import { getJWT } from "../../../store/slices/auth";
import { DokumentItem } from "../DocumentPreview";
import FeatureFormLayout from "./FeatureFormLayout";
import MastFormFields from "./MastFormFields";
import LeuchteFormFields from "./LeuchteFormFields";

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

  // Extract leuchtenArray from mast and sort by leuchtennummer
  const leuchtenArray = [
    ...((mast?.leuchtenArray as Array<Record<string, unknown>>) || []),
  ].sort((a, b) => {
    const numA = Number(a.leuchtennummer) || 0;
    const numB = Number(b.leuchtennummer) || 0;
    return numA - numB;
  });

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

  // Helper to generate Leuchte tab label matching sidebar format
  // Format: "{leuchtentyp}-{leuchtennummer}, {lfd_nummer}" with subtitle "{fabrikat}"
  const getLeuchteTabLabel = (leuchte: Record<string, unknown>) => {
    const leuchtentyp = leuchte.tkey_leuchtentyp as
      | { leuchtentyp?: string; fabrikat?: string }
      | undefined;
    const typ = leuchtentyp?.leuchtentyp || "L";
    const nummer = leuchte.leuchtennummer || "0";
    const lfdNummer = leuchte.lfd_nummer ? `, ${leuchte.lfd_nummer}` : "";
    const fabrikat = leuchtentyp?.fabrikat || "";

    const main = `${typ}-${nummer}${lfdNummer}`;

    return (
      <div className="text-left">
        <div className="font-semibold">{main}</div>
        {/* {fabrikat && <div className="text-xs text-gray-500 font-normal">{fabrikat}</div>} */}
      </div>
    );
  };

  // Build additional tabs - add Leuchte tab for each element in leuchtenArray
  // Cast to any to allow ReactNode label (Ant Design supports this)
  const additionalTabs = leuchtenArray.map((leuchte, index) => ({
    key: `leuchte-${leuchte.id || index}`,
    label: getLeuchteTabLabel(leuchte) as unknown as string,
    children: <LeuchteFormFields leuchte={leuchte} />,
  }));

  return (
    <FeatureFormLayout
      title="Mast bearbeiten"
      subtitle={subtitle}
      documents={documents}
      jwt={jwt}
      pendingFiles={pendingFiles}
      onFilesChange={setPendingFiles}
      debugData={data}
      additionalTabs={additionalTabs}
    >
      <MastFormFields mast={mast} />
    </FeatureFormLayout>
  );
};

export default MastForm;
