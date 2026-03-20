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
}

const ArbeitsauftragForm = ({ data, loading }: ArbeitsauftragFormProps) => {
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

  const subtitle = data.nummer ? `AU-${data.nummer}` : "";

  return (
    <FeatureFormLayout
      title="Arbeitsauftrag"
      subtitle={subtitle}
      documents={documents}
      jwt={jwt}
      debugData={data}
      loading={loading}
      readOnly
    >
      <ArbeitsauftragFormFields data={data} />
    </FeatureFormLayout>
  );
};

export default ArbeitsauftragForm;
