import { useMemo } from "react";
import type { ReactNode } from "react";
import { Timeline } from "antd";
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
  readOnly?: boolean;
  onToggleReadOnly?: () => void;
  onCancel?: () => void;
  onBack?: () => void;
  onFormInstance?: (form: import("antd").FormInstance) => void;
  draftValues?: Record<string, unknown>;
  onValuesChange?: (
    changedValues: Record<string, unknown>,
    allValues: Record<string, unknown>,
  ) => void;
  onOriginalValues?: (values: Record<string, unknown>) => void;
}

const ArbeitsprotokollForm = ({
  data,
  loading,
  readOnly = true,
  onToggleReadOnly,
  onCancel,
  onBack,
  onFormInstance,
  draftValues,
  onValuesChange,
  onOriginalValues,
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

  const aenderungItems = useMemo(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const arr: Record<string, any>[] = data?.arbeitsprotokollaktionArray ?? [];
    return arr.map((entry) => ({
      color: "blue" as const,
      children: (
        <div>
          {entry.aenderung ?? ""}:{" "}von{" "}
          <span style={{ color: "grey" }}>{entry.alt}</span> zu{" "}
          <b>{entry.neu || "-"}</b>
        </div>
      ),
    }));
  }, [data]);

  const timelineContent = (
    <div>
      <div
        style={{ fontSize: 14, fontWeight: 500, color: "#374151", marginBottom: 8 }}
      >
        Änderungen ({aenderungItems.length})
      </div>
      {aenderungItems.length > 0 ? (
        <Timeline style={{ paddingInlineStart: 0 }} items={aenderungItems} />
      ) : (
        <div style={{ color: "#8c8c8c", fontSize: 13, padding: "16px 0" }}>
          Keine Änderungen vorhanden
        </div>
      )}
    </div>
  );

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
      case "tdta_leuchten": {
        // Map fk_* keys from AP endpoint to tkey_* keys expected by LeuchteFormFields
        const leuchteData = {
          ...obj,
          tkey_strassenschluessel: obj.fk_strassenschluessel,
          tkey_kennziffer: obj.fk_kennziffer,
          tkey_leuchtentyp: obj.fk_leuchttyp,
          tkey_energielieferant: obj.fk_energielieferant,
          tkey_unterh_leuchte: obj.fk_unterhaltspflicht_leuchte,
          rundsteuerempfaengerObject: obj.rundsteuerempfaenger,
          fk_dk1Object: obj.fk_dk1,
          fk_dk2Object: obj.fk_dk2,
          leuchtmittelObject: obj.leuchtmittel,
        };
        content = <LeuchteFormFields leuchte={leuchteData} readOnly />;
        break;
      }
      case "tdta_standort_mast": {
        // Map fk_* keys from AP endpoint to tkey_* keys expected by MastFormFields
        const mastData = {
          ...obj,
          tkey_strassenschluessel: obj.fk_strassenschluessel,
          tkey_kennziffer: obj.fk_kennziffer,
          tkey_bezirk: obj.fk_stadtbezirk,
          tkey_mastart: obj.fk_mastart,
          tkey_masttyp: obj.fk_masttyp,
          tkey_klassifizierung: obj.fk_klassifizierung,
          tkey_unterh_mast: obj.fk_unterhaltspflicht_mast,
          anlagengruppeObject: obj.anlagengruppe,
        };
        content = <MastFormFields mast={mastData} readOnly />;
        break;
      }
      case "leitung":
        content = <LeitungFormFields leitung={obj} readOnly />;
        break;
      case "schaltstelle": {
        // Map fk_* keys from AP endpoint to tkey_* keys expected by SchaltstelleFormFields
        const schaltstelleData = {
          ...obj,
          tkey_strassenschluessel: obj.fk_strassenschluessel,
          bauart: obj.fk_bauart,
          rundsteuerempfaengerObject: obj.rundsteuerempfaenger,
        };
        content = (
          <SchaltstelleFormFields schaltstelle={schaltstelleData} readOnly />
        );
        break;
      }
      case "mauerlasche": {
        // Map fk_* keys from AP endpoint to tkey_* keys expected by MauerlascheFormFields
        const mauerlascheData = {
          ...obj,
          tkey_strassenschluessel: obj.fk_strassenschluessel,
          material_mauerlasche: obj.fk_material,
        };
        content = (
          <MauerlascheFormFields mauerlasche={mauerlascheData} readOnly />
        );
        break;
      }
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
      sideContent={timelineContent}
      debugData={data}
      loading={loading}
      readOnly={readOnly}
      onToggleReadOnly={onToggleReadOnly}
      onCancel={onCancel}
      onBack={onBack}
      additionalTabs={fachobjektTab ? [fachobjektTab] : []}
    >
      <ArbeitsprotokollFormFields
        data={data}
        fachobjektType={fachobjekt?.type}
        readOnly={readOnly}
        onFormInstance={onFormInstance}
        draftValues={draftValues}
        onValuesChange={onValuesChange}
        onOriginalValues={onOriginalValues}
      />
    </FeatureFormLayout>
  );
};

export default ArbeitsprotokollForm;
