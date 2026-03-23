import { useMemo } from "react";
import type { ReactNode } from "react";
import { useSelector } from "react-redux";
import { getFachobjektOfProtocol } from "@carma-appframeworks/belis";
import FeatureFormLayout from "./FeatureFormLayout";
import ArbeitsprotokollFormFields from "./ArbeitsprotokollFormFields";
import LeuchteFormFields from "./LeuchteFormFields";
import MastFormFields from "./MastFormFields";
import LeitungFormFields from "./LeitungFormFields";
import SchaltstelleFormFields from "./SchaltstelleFormFields";
import MauerlascheFormFields from "./MauerlascheFormFields";
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

  const fachobjektTab = useMemo(() => {
    if (!fachobjekt?.type) return null;
    const type = fachobjekt.type;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const obj = (data as Record<string, any>)[type] ?? null;
    if (!obj) return null;

    let content: ReactNode = null;
    switch (type) {
      case "tdta_leuchten":
        content = <LeuchteFormFields leuchte={obj} readOnly />;
        break;
      case "tdta_standort_mast":
        content = <MastFormFields mast={obj} readOnly />;
        break;
      case "leitung":
        content = <LeitungFormFields leitung={obj} readOnly />;
        break;
      case "schaltstelle":
        content = <SchaltstelleFormFields schaltstelle={obj} readOnly />;
        break;
      case "mauerlasche":
        content = <MauerlascheFormFields mauerlasche={obj} readOnly />;
        break;
      default:
        return null;
    }
    return { key: "fachobjekt", label: subtitle, children: content };
  }, [fachobjekt, data, subtitle]);

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
      additionalTabs={fachobjektTab ? [fachobjektTab] : []}
    >
      <ArbeitsprotokollFormFields
        data={data}
        fachobjektType={fachobjekt?.type}
      />
    </FeatureFormLayout>
  );
};

export default ArbeitsprotokollForm;
