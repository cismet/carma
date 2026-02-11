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

interface LeuchteFormProps {
  data: Record<string, unknown> | null;
  rawFeature?: { properties?: Record<string, unknown> } | null;
  onClose?: () => void;
}

interface LeuchttypItem {
  id: number;
  leuchtentyp?: string;
  fabrikat?: string;
}

interface KennzifferItem {
  id: number;
  kennziffer?: string;
  beschreibung?: string;
}

interface EnergielieferantItem {
  id: number;
  energielieferant?: string;
}

interface RundsteuerempfaengerItem {
  id: number;
  rs_typ?: string;
}

interface DoppelkommandoItem {
  id: number;
  pk?: string;
  beschreibung?: string;
}

interface UnterhaltLeuchteItem {
  id: number;
  unterhaltspflichtiger_leuchte?: string;
}

interface LeuchtmittelItem {
  id: number;
  lichtfarbe?: string;
  hersteller?: string;
}

const LeuchteForm = ({ data, rawFeature, onClose }: LeuchteFormProps) => {
  const [form] = Form.useForm();
  const [pendingFiles, setPendingFiles] = useState<UploadFile[]>([]);
  const keyTablesData = useSelector(getKeyTablesData);
  const jwt = useSelector(getJWT);

  // Key table options
  const leuchttypOptions = (keyTablesData.leuchtentyp || []) as LeuchttypItem[];
  const kennzifferOptions = (keyTablesData.kennziffer ||
    []) as KennzifferItem[];
  const energielieferantOptions = (keyTablesData.energielieferant ||
    []) as EnergielieferantItem[];
  const doppelkommandoOptions = (keyTablesData.doppelkommando ||
    []) as DoppelkommandoItem[];
  const unterhaltLeuchteOptions = (keyTablesData.unterhaltLeuchte ||
    []) as UnterhaltLeuchteItem[];
  const leuchtmittelOptions = (keyTablesData.leuchtmittel ||
    []) as LeuchtmittelItem[];
  const rundsteuerempfaengerOptions = (keyTablesData["rundsteuerempfänger"] ||
    []) as RundsteuerempfaengerItem[];

  // Extract documents from data
  const documents: DokumentItem[] = (data?.dokumente as DokumentItem[]) || [];

  // Extract fabrikat for subtitle - use rawFeature (vector tile) to match list display
  const rawProps = rawFeature?.properties;
  const subtitle =
    (rawProps?.fabrikat as string) ||
    (rawProps?.leuchttyp_fabrikat as string) ||
    "-ohne Fabrikat-";

  useEffect(() => {
    // Reset form when data changes to clear old values
    form.resetFields();

    if (data) {
      const leuchteData = data as Record<string, unknown>;
      const { tdta_leuchten } = leuchteData;
      if (
        !tdta_leuchten ||
        !Array.isArray(tdta_leuchten) ||
        tdta_leuchten.length === 0
      ) {
        return;
      }
      const leuchte = tdta_leuchten[0];
      form.setFieldsValue({
        // Straßenschlüssel
        strassenschluessel_pk: leuchte.tkey_strassenschluessel?.pk,
        strassenschluessel_strasse: leuchte.tkey_strassenschluessel?.strasse,
        // Kennziffer - use id for Select value
        fk_kennziffer: leuchte.tkey_kennziffer?.id ?? null,
        // Laufende Nr. / Leuchtennummer
        lfd_nummer: leuchte.lfd_nummer,
        leuchtennummer: leuchte.leuchtennummer,
        // Leuchtentyp - use id for Select value
        fk_leuchttyp: leuchte.tkey_leuchtentyp?.id ?? null,
        // Inbetriebnahme / Zähler
        inbetriebnahme_leuchte: leuchte.inbetriebnahme_leuchte
          ? dayjs(leuchte.inbetriebnahme_leuchte as string)
          : null,
        zaehler: leuchte.zaehler,
        // Montagefirma
        montagefirma_leuchte: leuchte.montagefirma_leuchte,
        // Energielieferant - use id for Select value
        fk_energielieferant: leuchte.tkey_energielieferant?.id ?? null,
        // Schaltstelle
        schaltstelle: leuchte.schaltstelle,
        // Rundsteuerempfänger - use id for Select value
        fk_rundsteuerempfaenger: leuchte.rundsteuerempfaengerObject?.id ?? null,
        // Einbaudatum
        einbaudatum: leuchte.einbaudatum
          ? dayjs(leuchte.einbaudatum as string)
          : null,
        // Doppelkommando 1 - use id for Select value
        fk_dk1: leuchte.fk_dk1Object?.id ?? leuchte.fk_dk1,
        anzahl_1dk: leuchte.anzahl_1dk,
        anschlussleistung_1dk: leuchte.anschlussleistung_1dk,
        // Doppelkommando 2 - use id for Select value
        fk_dk2: leuchte.fk_dk2Object?.id ?? leuchte.fk_dk2,
        anzahl_2dk: leuchte.anzahl_2dk,
        anschlussleistung_2dk: leuchte.anschlussleistung_2dk,
        // Unterhalt Leuchte - use id for Select value
        fk_unterhalt_leuchte: leuchte.tkey_unterh_leuchte?.id ?? null,
        // Leuchtmittelwechsel
        wechseldatum: leuchte.wechseldatum
          ? dayjs(leuchte.wechseldatum as string)
          : null,
        naechster_wechsel: leuchte.naechster_wechsel
          ? dayjs(leuchte.naechster_wechsel as string)
          : null,
        // Leuchtmittel - use id for Select value
        fk_leuchtmittel: leuchte.leuchtmittelObject?.id ?? leuchte.leuchtmittel,
        // Lebensdauer
        lebensdauer: leuchte.lebensdauer,
        // Sonderturnus
        sonderturnus: leuchte.wartungszyklus
          ? dayjs(leuchte.wartungszyklus as string)
          : null,
        // Vorschaltgerät
        vorschaltgeraet: leuchte.vorschaltgeraet,
        // Erneuerung VG
        wechselvorschaltgeraet: leuchte.wechselvorschaltgeraet
          ? dayjs(leuchte.wechselvorschaltgeraet as string)
          : null,
        // Bemerkung
        bemerkungen: leuchte.bemerkungen,
      });
    }
  }, [data, form]);

  if (!data) {
    return (
      <div className="flex items-center justify-center h-40 text-gray-400">
        Keine Daten ausgewählt
      </div>
    );
  }

  const FormLabel = ({ children }: { children: React.ReactNode }) => (
    <span className="text-sm font-medium text-gray-700">{children}</span>
  );

  return (
    <FeatureFormLayout
      title="Leuchte bearbeiten"
      subtitle={subtitle}
      documents={documents}
      jwt={jwt}
      pendingFiles={pendingFiles}
      onFilesChange={setPendingFiles}
      debugData={data}
    >
      <Form form={form} layout="vertical" requiredMark={false} className="pr-2">
        {/* Straßenschlüssel */}
        <Row gutter={16}>
          <Col span={6}>
            <Form.Item
              name="strassenschluessel_pk"
              label={<FormLabel>Straßenschlüssel</FormLabel>}
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
            placeholder="Kennziffer auswählen"
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

        {/* Laufende Nr. and Leuchtennummer */}
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
              name="leuchtennummer"
              label={<FormLabel>Leuchtennummer</FormLabel>}
              className="mb-4"
            >
              <InputNumber className="w-full" size="large" />
            </Form.Item>
          </Col>
        </Row>

        {/* Leuchtentyp */}
        <Form.Item
          name="fk_leuchttyp"
          label={<FormLabel>Leuchtentyp</FormLabel>}
          className="mb-4"
        >
          <Select
            placeholder="Leuchtentyp auswählen"
            className="w-full"
            size="large"
            showSearch
            optionFilterProp="children"
          >
            {leuchttypOptions.map((item) => (
              <Select.Option key={item.id} value={item.id}>
                {item.leuchtentyp} {item.fabrikat}
              </Select.Option>
            ))}
          </Select>
        </Form.Item>

        {/* Inbetriebnahme and Zähler */}
        <Row gutter={16}>
          <Col span={12}>
            <Form.Item
              name="inbetriebnahme_leuchte"
              label={<FormLabel>Inbetriebnahme</FormLabel>}
              className="mb-4"
            >
              <DatePicker
                className="w-full"
                size="large"
                format="DD.MM.YYYY"
                placeholder="Datum auswählen"
              />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item
              name="zaehler"
              valuePropName="checked"
              className="mb-4 mt-8"
            >
              <Checkbox>Zähler vorhanden</Checkbox>
            </Form.Item>
          </Col>
        </Row>

        {/* Montagefirma */}
        <Form.Item
          name="montagefirma_leuchte"
          label={<FormLabel>Montagefirma</FormLabel>}
          className="mb-4"
        >
          <Input size="large" />
        </Form.Item>

        {/* Energielieferant */}
        <Form.Item
          name="fk_energielieferant"
          label={<FormLabel>Energielieferant</FormLabel>}
          className="mb-4"
        >
          <Select
            placeholder="Energielieferant auswählen"
            className="w-full"
            size="large"
            showSearch
            optionFilterProp="children"
          >
            {energielieferantOptions.map((item) => (
              <Select.Option key={item.id} value={item.id}>
                {item.energielieferant}
              </Select.Option>
            ))}
          </Select>
        </Form.Item>

        {/* Schaltstelle */}
        <Form.Item
          name="schaltstelle"
          label={<FormLabel>Schaltstelle</FormLabel>}
          className="mb-4"
        >
          <Input size="large" />
        </Form.Item>

        {/* Rundsteuerempfänger */}
        <Form.Item
          name="fk_rundsteuerempfaenger"
          label={<FormLabel>Rundsteuerempf.</FormLabel>}
          className="mb-4"
        >
          <Select
            placeholder="Rundsteuerempfänger auswählen"
            className="w-full"
            size="large"
            showSearch
            optionFilterProp="children"
          >
            {rundsteuerempfaengerOptions.map((item) => (
              <Select.Option key={item.id} value={item.id}>
                {item.rs_typ}
              </Select.Option>
            ))}
          </Select>
        </Form.Item>

        {/* Einbaudatum */}
        <Form.Item
          name="einbaudatum"
          label={<FormLabel>Einbaudatum</FormLabel>}
          className="mb-4"
        >
          <DatePicker
            className="w-full"
            size="large"
            format="DD.MM.YYYY"
            placeholder="Datum auswählen"
          />
        </Form.Item>

        {/* Doppelkommando 1 */}
        <Row gutter={16}>
          <Col span={16}>
            <Form.Item
              name="fk_dk1"
              label={<FormLabel>Doppelkommando 1</FormLabel>}
              className="mb-4"
            >
              <Select
                placeholder="Auswählen"
                className="w-full"
                size="large"
                showSearch
                optionFilterProp="children"
              >
                {doppelkommandoOptions.map((item) => (
                  <Select.Option key={item.id} value={item.id}>
                    {item.pk} - {item.beschreibung}
                  </Select.Option>
                ))}
              </Select>
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item
              name="anzahl_1dk"
              label={<FormLabel>Anzahl</FormLabel>}
              className="mb-4"
            >
              <InputNumber className="w-full" size="large" />
            </Form.Item>
          </Col>
        </Row>

        {/* Anschlussleistung 1 */}
        <Form.Item
          name="anschlussleistung_1dk"
          label={<FormLabel>Anschlussleistung</FormLabel>}
          className="mb-4"
        >
          <InputNumber
            className="w-full"
            size="large"
            precision={2}
            decimalSeparator=","
          />
        </Form.Item>

        {/* Doppelkommando 2 */}
        <Row gutter={16}>
          <Col span={16}>
            <Form.Item
              name="fk_dk2"
              label={<FormLabel>Doppelkommando 2</FormLabel>}
              className="mb-4"
            >
              <Select
                placeholder="Auswählen"
                className="w-full"
                size="large"
                allowClear
                showSearch
                optionFilterProp="children"
              >
                {doppelkommandoOptions.map((item) => (
                  <Select.Option key={item.id} value={item.id}>
                    {item.pk} - {item.beschreibung}
                  </Select.Option>
                ))}
              </Select>
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item
              name="anzahl_2dk"
              label={<FormLabel>Anzahl</FormLabel>}
              className="mb-4"
            >
              <InputNumber className="w-full" size="large" />
            </Form.Item>
          </Col>
        </Row>

        {/* Anschlussleistung 2 */}
        <Form.Item
          name="anschlussleistung_2dk"
          label={<FormLabel>Anschlussleistung</FormLabel>}
          className="mb-4"
        >
          <InputNumber
            className="w-full"
            size="large"
            precision={2}
            decimalSeparator=","
          />
        </Form.Item>

        {/* Unterhalt Leuchte */}
        <Form.Item
          name="fk_unterhalt_leuchte"
          label={<FormLabel>Unterhalt Leuchte</FormLabel>}
          className="mb-4"
        >
          <Select
            placeholder="Auswählen"
            className="w-full"
            size="large"
            showSearch
            optionFilterProp="children"
          >
            {unterhaltLeuchteOptions.map((item) => (
              <Select.Option key={item.id} value={item.id}>
                {item.unterhaltspflichtiger_leuchte}
              </Select.Option>
            ))}
          </Select>
        </Form.Item>

        {/* Leuchtmittelwechsel / Nächster Wechsel */}
        <Row gutter={16}>
          <Col span={12}>
            <Form.Item
              name="wechseldatum"
              label={<FormLabel>Leuchtmittelwechsel</FormLabel>}
              className="mb-4"
            >
              <DatePicker
                className="w-full"
                size="large"
                format="DD.MM.YYYY"
                placeholder="Datum auswählen"
              />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item
              name="naechster_wechsel"
              label={<FormLabel>Nächster Wechsel</FormLabel>}
              className="mb-4"
            >
              <DatePicker
                className="w-full"
                size="large"
                format="DD.MM.YYYY"
                placeholder="Datum auswählen"
              />
            </Form.Item>
          </Col>
        </Row>

        {/* Leuchtmittel */}
        <Form.Item
          name="fk_leuchtmittel"
          label={<FormLabel>Leuchtmittel</FormLabel>}
          className="mb-4"
        >
          <Select
            placeholder="Leuchtmittel auswählen"
            className="w-full"
            size="large"
            showSearch
            optionFilterProp="children"
          >
            {leuchtmittelOptions.map((item) => (
              <Select.Option key={item.id} value={item.id}>
                {item.hersteller} {item.lichtfarbe}
              </Select.Option>
            ))}
          </Select>
        </Form.Item>

        {/* Lebensdauer */}
        <Form.Item
          name="lebensdauer"
          label={<FormLabel>Lebensdauer</FormLabel>}
          className="mb-4"
        >
          <InputNumber
            className="w-full"
            size="large"
            precision={2}
            decimalSeparator=","
          />
        </Form.Item>

        {/* Sonderturnus */}
        <Form.Item
          name="sonderturnus"
          label={<FormLabel>Sonderturnus</FormLabel>}
          className="mb-4"
        >
          <DatePicker
            className="w-full"
            size="large"
            format="DD.MM.YYYY"
            placeholder="Datum auswählen"
          />
        </Form.Item>

        {/* Vorschaltgerät */}
        <Form.Item
          name="vorschaltgeraet"
          label={<FormLabel>Vorschaltgerät</FormLabel>}
          className="mb-4"
        >
          <Input size="large" />
        </Form.Item>

        {/* Erneuerung VG */}
        <Form.Item
          name="wechselvorschaltgeraet"
          label={<FormLabel>Erneuerung VG</FormLabel>}
          className="mb-4"
        >
          <DatePicker
            className="w-full"
            size="large"
            format="DD.MM.YYYY"
            placeholder="Datum auswählen"
          />
        </Form.Item>

        {/* Bemerkung */}
        <Form.Item
          name="bemerkungen"
          label={<FormLabel>Bemerkung</FormLabel>}
          className="mb-4"
        >
          <Input.TextArea rows={4} size="large" />
        </Form.Item>
      </Form>
    </FeatureFormLayout>
  );
};

export default LeuchteForm;
