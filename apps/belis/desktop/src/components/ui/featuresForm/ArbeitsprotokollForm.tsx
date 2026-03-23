import { useMemo } from "react";
import { useSelector } from "react-redux";
import { getFachobjektOfProtocol } from "@carma-appframeworks/belis";
import FeatureFormLayout from "./FeatureFormLayout";
import ArbeitsprotokollFormFields from "./ArbeitsprotokollFormFields";
import type { DokumentItem } from "../DocumentPreview";
import { getJWT } from "../../../store/slices/auth";

interface ArbeitsprotokollFormProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: Record<string, any>;
  loading?: boolean;
  onBack?: () => void;
}

const ArbeitsprotokollForm = ({
  data,
  loading,
  onBack,
}: ArbeitsprotokollFormProps) => {
  const jwt = useSelector(getJWT);

  const fachobjekt = useMemo(() => getFachobjektOfProtocol(data), [data]);

  const documents: DokumentItem[] = useMemo(() => {
    const docs: DokumentItem[] = [];
    const arr = data?.veranlassung?.ar_dokumenteArray;
    if (!arr) return docs;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const doc of arr as Record<string, any>[]) {
      if (doc?.dms_url) {
        docs.push(doc as DokumentItem);
      }
    }
    return docs;
  }, [data]);

  const title = `Protokoll #${data.protokollnummer ?? ""}`;
  const subtitle = fachobjekt?.shortname ?? "";

  return (
    <FeatureFormLayout
      title={title}
      subtitle={subtitle}
      documents={documents}
      jwt={jwt}
      debugData={data}
      loading={loading}
      readOnly
      onBack={onBack}
    >
      <ArbeitsprotokollFormFields
        data={data}
        fachobjektType={fachobjekt?.type}
      />
    </FeatureFormLayout>
  );
};

export default ArbeitsprotokollForm;
