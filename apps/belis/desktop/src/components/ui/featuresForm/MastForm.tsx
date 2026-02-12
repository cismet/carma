import { useEffect, useState } from "react";
import {
  Form,
  Row,
  Col,
  Select,
  Input,
  DatePicker,
  Checkbox,
  InputNumber,
} from "antd";
import type { UploadFile } from "antd";
import { useSelector } from "react-redux";
import { getKeyTablesData } from "../../../store/slices/keyTables";
import { getJWT } from "../../../store/slices/auth";
import { DokumentItem } from "../DocumentPreview";
import FeatureFormLayout from "./FeatureFormLayout";
import dayjs from "dayjs";

interface MastFormProps {
  data: Record<string, unknown> | null;
  rawFeature?: { properties?: Record<string, unknown> } | null;
  onClose?: () => void;
}

interface MasttypItem {
  id: number;
  masttyp?: string;
  bezeichnung?: string;
}

interface MastartItem {
  id: number;
  pk?: string;
  mastart?: string;
}

interface KlassifizierungItem {
  id: number;
  pk?: string;
  klassifizierung?: string;
}

interface UnterhaltMastItem {
  id: number;
  pk?: string;
  unterhalt_mast?: string;
}

interface KennzifferItem {
  id: number;
  kennziffer?: string;
  beschreibung?: string;
}

interface AnlagengruppeItem {
  id: number;
  nummer?: number;
  bezeichnung?: string;
}

interface BezirkItem {
  id: number;
  pk?: string;
  bezirk?: string;
}

const MastForm = ({ data, rawFeature, onClose }: MastFormProps) => {
  const [form] = Form.useForm();
  const [pendingFiles, setPendingFiles] = useState<UploadFile[]>([]);
  const keyTablesData = useSelector(getKeyTablesData);
  const jwt = useSelector(getJWT);

  // Key table options - sorted alphabetically
  const masttypOptions = [
    ...((keyTablesData.masttyp || []) as MasttypItem[]),
  ].sort((a, b) =>
    `${a.masttyp || ""} ${a.bezeichnung || ""}`.localeCompare(
      `${b.masttyp || ""} ${b.bezeichnung || ""}`
    )
  );
  const mastartOptions = [
    ...((keyTablesData.mastart || []) as MastartItem[]),
  ].sort((a, b) => (a.mastart || "").localeCompare(b.mastart || ""));
  const klassifizierungOptions = [
    ...((keyTablesData.klassifizierung || []) as KlassifizierungItem[]),
  ].sort((a, b) =>
    (a.klassifizierung || "").localeCompare(b.klassifizierung || "")
  );
  const unterhaltMastOptions = [
    ...((keyTablesData.unterhaltMast || []) as UnterhaltMastItem[]),
  ].sort((a, b) =>
    (a.unterhalt_mast || "").localeCompare(b.unterhalt_mast || "")
  );
  const kennzifferOptions = (keyTablesData.kennziffer ||
    []) as KennzifferItem[];
  const anlagengruppeOptions = (keyTablesData.anlagengruppe ||
    []) as AnlagengruppeItem[];
  const bezirkOptions = [
    ...((keyTablesData.bezirk || []) as BezirkItem[]),
  ].sort((a, b) => (a.bezirk || "").localeCompare(b.bezirk || ""));

  console.log("xxx bezirkOptions", bezirkOptions);

  // Extract documents from tdta_standort_mast[0].dokumenteArray
  const mastData = data as Record<string, unknown>;
  const mastArray = mastData?.tdta_standort_mast as
    | Array<Record<string, unknown>>
    | undefined;
  const documents: DokumentItem[] =
    (mastArray?.[0]?.dokumenteArray as DokumentItem[]) || [];

  // Extract subtitle - use rawFeature (vector tile) to match list display
  const rawProps = rawFeature?.properties;
  const subtitle =
    (rawProps?.standortangabe as string) ||
    (rawProps?.masttyp as string) ||
    "-ohne Standortangabe-";

  useEffect(() => {
    // Reset form when data changes to clear old values
    form.resetFields();

    if (data) {
      const mastData = data as Record<string, unknown>;
      const { tdta_standort_mast } = mastData;
      if (
        !tdta_standort_mast ||
        !Array.isArray(tdta_standort_mast) ||
        tdta_standort_mast.length === 0
      ) {
        return;
      }
      const mast = tdta_standort_mast[0];
      form.setFieldsValue({
        // Strassenschluessel
        strassenschluessel_pk: mast.tkey_strassenschluessel?.pk,
        strassenschluessel_strasse: mast.tkey_strassenschluessel?.strasse,
        // Kennziffer - use id for Select value
        fk_kennziffer: mast.tkey_kennziffer?.id ?? null,
        // Laufende Nr.
        lfd_nummer: mast.lfd_nummer,
        // Hausnummer
        haus_nr: mast.haus_nr,
        // Standortangabe
        standortangabe: mast.standortangabe,
        // Stadtbezirk - use id for Select value
        fk_bezirk: mast.tkey_bezirk?.id ?? null,
        // Mastart - use id for Select value
        fk_mastart: mast.tkey_mastart?.id ?? null,
        // Masttyp - use id for Select value
        fk_masttyp: mast.tkey_masttyp?.id ?? null,
        // Klassifizierung - use id for Select value
        fk_klassifizierung: mast.tkey_klassifizierung?.id ?? null,
        // Unterhalt - use id for Select value
        fk_unterhalt_mast: mast.tkey_unterh_mast?.id ?? null,
        // Inbetriebnahme
        inbetriebnahme_mast: mast.inbetriebnahme_mast
          ? dayjs(mast.inbetriebnahme_mast as string)
          : null,
        // V-Einheit
        verrechnungseinheit: mast.verrechnungseinheit,
        // Mastanstrich
        mastanstrich: mast.mastanstrich
          ? dayjs(mast.mastanstrich as string)
          : null,
        // Anstrichfarbe
        anstrichfarbe: mast.anstrichfarbe,
        // Montagefirma
        montagefirma: mast.montagefirma,
        // Gruendung
        gruendung: mast.gruendung,
        // Standsicherheitspruefung
        standsicherheitspruefung: mast.standsicherheitspruefung
          ? dayjs(mast.standsicherheitspruefung as string)
          : null,
        // Naechstes Pruefdatum
        naechstes_pruefdatum: mast.naechstes_pruefdatum
          ? dayjs(mast.naechstes_pruefdatum as string)
          : null,
        // Verfahren
        verfahren: mast.verfahren,
        // Elektrische Pruefung
        elek_pruefung: mast.elek_pruefung
          ? dayjs(mast.elek_pruefung as string)
          : null,
        // Erdung
        erdung: mast.erdung,
        // Monteur
        monteur: mast.monteur,
        // Mastschutz
        mastschutz: mast.mastschutz,
        // Revision
        revision: mast.revision,
        // Anlagengruppe - use id for Select value
        fk_anlagengruppe: mast.anlagengruppeObject?.id ?? mast.anlagengruppe,
        // Anbauten
        anbauten: mast.anbauten,
        // Bemerkungen
        bemerkungen: mast.bemerkungen,
        // Letzte Aenderung
        letzte_aenderung: mast.letzte_aenderung
          ? dayjs(mast.letzte_aenderung as string)
          : null,
      });
    }
  }, [data, form]);

  if (!data) {
    return (
      <div className="flex items-center justify-center h-40 text-gray-400">
        Keine Daten ausgewahlt
      </div>
    );
  }

  const FormLabel = ({ children }: { children: React.ReactNode }) => (
    <span className="text-sm font-medium text-gray-700">{children}</span>
  );

  return (
    <FeatureFormLayout
      title="Mast bearbeiten"
      subtitle="Füllen Sie die folgenden Informationen aus"
      documents={documents}
      jwt={jwt}
      pendingFiles={pendingFiles}
      onFilesChange={setPendingFiles}
      debugData={data}
    >
      <Form form={form} layout="vertical" requiredMark={false} className="pr-2">
        {/* Strassenschluessel */}
        <Row gutter={16}>
          <Col span={6}>
            <Form.Item
              name="strassenschluessel_pk"
              label={<FormLabel>Strassenschlussel</FormLabel>}
              className="mb-4"
            >
              <Input size="large" />
            </Form.Item>
          </Col>
          <Col span={18}>
            <Form.Item
              name="strassenschluessel_strasse"
              label={<FormLabel>&nbsp;</FormLabel>}
              className="mb-4"
            >
              <Input size="large" />
            </Form.Item>
          </Col>
        </Row>

        {/* Kennziffer */}
        <Form.Item
          name="fk_kennziffer"
          label={<FormLabel>Kennziffer</FormLabel>}
          className="mb-4"
        >
          <Select
            placeholder="Kennziffer auswahlen"
            className="w-full"
            size="large"
            showSearch
            optionFilterProp="children"
          >
            {kennzifferOptions.map((item) => (
              <Select.Option key={item.id} value={item.id}>
                {item.kennziffer} - {item.beschreibung}
              </Select.Option>
            ))}
          </Select>
        </Form.Item>

        {/* Laufende Nr. and Hausnummer */}
        <Row gutter={16}>
          <Col span={12}>
            <Form.Item
              name="lfd_nummer"
              label={<FormLabel>Laufende Nr.</FormLabel>}
              className="mb-4"
            >
              <InputNumber className="w-full" size="large" />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item
              name="haus_nr"
              label={<FormLabel>Hausnummer</FormLabel>}
              className="mb-4"
            >
              <Input size="large" />
            </Form.Item>
          </Col>
        </Row>

        {/* Standortangabe */}
        <Form.Item
          name="standortangabe"
          label={<FormLabel>Standortangabe</FormLabel>}
          className="mb-4"
        >
          <Input size="large" />
        </Form.Item>

        {/* Stadtbezirk */}
        <Form.Item
          name="fk_bezirk"
          label={<FormLabel>Stadtbezirk</FormLabel>}
          className="mb-4"
        >
          <Select
            placeholder="Stadtbezirk auswahlen"
            className="w-full"
            size="large"
            showSearch
            optionFilterProp="children"
          >
            {bezirkOptions.map((item) => (
              <Select.Option key={item.id} value={item.id}>
                {item.bezirk}
              </Select.Option>
            ))}
          </Select>
        </Form.Item>

        {/* Mastart */}
        <Form.Item
          name="fk_mastart"
          label={<FormLabel>Mastart</FormLabel>}
          className="mb-4"
        >
          <Select
            placeholder="Mastart auswahlen"
            className="w-full"
            size="large"
            showSearch
            optionFilterProp="children"
          >
            {mastartOptions.map((item) => (
              <Select.Option key={item.id} value={item.id}>
                {item.mastart}
              </Select.Option>
            ))}
          </Select>
        </Form.Item>

        {/* Masttyp */}
        <Form.Item
          name="fk_masttyp"
          label={<FormLabel>Masttyp</FormLabel>}
          className="mb-4"
        >
          <Select
            placeholder="Masttyp auswahlen"
            className="w-full"
            size="large"
            showSearch
            optionFilterProp="children"
          >
            {masttypOptions.map((item) => (
              <Select.Option key={item.id} value={item.id}>
                {item.masttyp} {item.bezeichnung}
              </Select.Option>
            ))}
          </Select>
        </Form.Item>

        {/* Klassifizierung */}
        <Form.Item
          name="fk_klassifizierung"
          label={<FormLabel>Klassifizierung</FormLabel>}
          className="mb-4"
        >
          <Select
            placeholder="Klassifizierung auswahlen"
            className="w-full"
            size="large"
            showSearch
            optionFilterProp="children"
          >
            {klassifizierungOptions.map((item) => (
              <Select.Option key={item.id} value={item.id}>
                {item.klassifizierung}
              </Select.Option>
            ))}
          </Select>
        </Form.Item>

        {/* Unterhalt */}
        <Form.Item
          name="fk_unterhalt_mast"
          label={<FormLabel>Unterhalt</FormLabel>}
          className="mb-4"
        >
          <Select
            placeholder="Unterhalt auswahlen"
            className="w-full"
            size="large"
            showSearch
            optionFilterProp="children"
          >
            {unterhaltMastOptions.map((item) => (
              <Select.Option key={item.id} value={item.id}>
                {item.unterhalt_mast}
              </Select.Option>
            ))}
          </Select>
        </Form.Item>

        {/* Inbetriebnahme and V-Einheit */}
        <Row gutter={16}>
          <Col span={12}>
            <Form.Item
              name="inbetriebnahme_mast"
              label={<FormLabel>Inbetriebnahme</FormLabel>}
              className="mb-4"
            >
              <DatePicker
                className="w-full"
                size="large"
                format="DD.MM.YYYY"
                placeholder="Datum auswahlen"
              />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item
              name="verrechnungseinheit"
              valuePropName="checked"
              className="mb-4 mt-8"
            >
              <Checkbox>V-Einheit</Checkbox>
            </Form.Item>
          </Col>
        </Row>

        {/* Mastanstrich and Anstrichfarbe */}
        <Row gutter={16}>
          <Col span={12}>
            <Form.Item
              name="mastanstrich"
              label={<FormLabel>Mastanstrich</FormLabel>}
              className="mb-4"
            >
              <DatePicker
                className="w-full"
                size="large"
                format="DD.MM.YYYY"
                placeholder="Datum auswahlen"
              />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item
              name="anstrichfarbe"
              label={<FormLabel>Anstrichfarbe</FormLabel>}
              className="mb-4"
            >
              <Input size="large" />
            </Form.Item>
          </Col>
        </Row>

        {/* Montagefirma */}
        <Form.Item
          name="montagefirma"
          label={<FormLabel>Montagefirma</FormLabel>}
          className="mb-4"
        >
          <Input size="large" />
        </Form.Item>

        {/* Gruendung */}
        <Form.Item
          name="gruendung"
          label={<FormLabel>Grundung</FormLabel>}
          className="mb-4"
        >
          <Input size="large" />
        </Form.Item>

        {/* Standsicherheitspruefung and Naechstes Pruefdatum */}
        <Row gutter={16}>
          <Col span={12}>
            <Form.Item
              name="standsicherheitspruefung"
              label={<FormLabel>Standsicherheitsprfg.</FormLabel>}
              className="mb-4"
            >
              <DatePicker
                className="w-full"
                size="large"
                format="DD.MM.YYYY"
                placeholder="Datum auswahlen"
              />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item
              name="naechstes_pruefdatum"
              label={<FormLabel>Nachstes Prufdatum</FormLabel>}
              className="mb-4"
            >
              <DatePicker
                className="w-full"
                size="large"
                format="DD.MM.YYYY"
                placeholder="Datum auswahlen"
              />
            </Form.Item>
          </Col>
        </Row>

        {/* Verfahren */}
        <Form.Item
          name="verfahren"
          label={<FormLabel>Verfahren</FormLabel>}
          className="mb-4"
        >
          <Input size="large" />
        </Form.Item>

        {/* Elektrische Pruefung and Erdung */}
        <Row gutter={16}>
          <Col span={12}>
            <Form.Item
              name="elek_pruefung"
              label={<FormLabel>Elektrische Prufung</FormLabel>}
              className="mb-4"
            >
              <DatePicker
                className="w-full"
                size="large"
                format="DD.MM.YYYY"
                placeholder="Datum auswahlen"
              />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item
              name="erdung"
              valuePropName="checked"
              className="mb-4 mt-8"
            >
              <Checkbox>Erdung i.O.</Checkbox>
            </Form.Item>
          </Col>
        </Row>

        {/* Monteur */}
        <Form.Item
          name="monteur"
          label={<FormLabel>Monteur</FormLabel>}
          className="mb-4"
        >
          <Input size="large" />
        </Form.Item>

        {/* Mastschutz and Revision */}
        <Row gutter={16}>
          <Col span={12}>
            <Form.Item
              name="mastschutz"
              label={<FormLabel>Mastschutz</FormLabel>}
              className="mb-4"
            >
              <Input size="large" />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item
              name="revision"
              label={<FormLabel>Revision</FormLabel>}
              className="mb-4"
            >
              <Input size="large" />
            </Form.Item>
          </Col>
        </Row>

        {/* Anlagengruppe */}
        <Form.Item
          name="fk_anlagengruppe"
          label={<FormLabel>Anlagengruppe</FormLabel>}
          className="mb-4"
        >
          <Select
            placeholder="Anlagengruppe auswahlen"
            className="w-full"
            size="large"
            showSearch
            optionFilterProp="children"
          >
            {anlagengruppeOptions.map((item) => (
              <Select.Option key={item.id} value={item.id}>
                {item.nummer} - {item.bezeichnung}
              </Select.Option>
            ))}
          </Select>
        </Form.Item>

        {/* Anbauten */}
        <Form.Item
          name="anbauten"
          label={<FormLabel>Anbauten</FormLabel>}
          className="mb-4"
        >
          <Input size="large" />
        </Form.Item>

        {/* Bemerkung */}
        <Form.Item
          name="bemerkungen"
          label={<FormLabel>Bemerkung</FormLabel>}
          className="mb-4"
        >
          <Input.TextArea rows={4} size="large" />
        </Form.Item>

        {/* Letzte Aenderung (readonly) */}
        <Form.Item
          name="letzte_aenderung"
          label={<FormLabel>Letzte Anderung</FormLabel>}
          className="mb-4"
        >
          <DatePicker className="w-full" size="large" format="DD.MM.YYYY" />
        </Form.Item>
      </Form>
    </FeatureFormLayout>
  );
};

export default MastForm;
