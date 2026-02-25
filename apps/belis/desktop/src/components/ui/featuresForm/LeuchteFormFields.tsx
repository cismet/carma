import { useEffect, useMemo } from "react";
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
import { useSelector } from "react-redux";
import { getKeyTablesData } from "../../../store/slices/keyTables";
import StrassenschluesselFields from "./StrassenschluesselFields";
import { getFormClassName, getPlaceholder } from "./readOnlyFormUtils";
import dayjs from "dayjs";

// Helper to sort options based on display text (same sorting as KeyTablesPage)
type SortMode = "none" | "alphabetical" | "numeric";

const sortOptions = <T,>(
  options: T[],
  getDisplayText: (item: T) => string,
  sortMode: SortMode = "none"
): T[] => {
  if (sortMode === "none") return options;
  return [...options].sort((a, b) => {
    const aText = getDisplayText(a);
    const bText = getDisplayText(b);
    if (sortMode === "alphabetical") {
      return aText.localeCompare(bText, "de", { sensitivity: "base" });
    }
    if (sortMode === "numeric") {
      return aText.localeCompare(bText, "de", { numeric: true });
    }
    return 0;
  });
};

interface LeuchteFormFieldsProps {
  leuchte: Record<string, unknown> | null;
  namePrefix?: string;
  readOnly?: boolean;
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
  pk?: number;
  unterhaltspflichtiger_leuchte?: string;
}

interface LeuchtmittelItem {
  id: number;
  lichtfarbe?: string;
  hersteller?: string;
}

// Helper type for nested objects with common properties
interface NestedObject {
  id?: number;
  pk?: string;
  strasse?: string;
}

const FormLabel = ({ children }: { children: React.ReactNode }) => (
  <span className="text-sm font-medium text-gray-700">{children}</span>
);

const LeuchteFormFields = ({ leuchte, namePrefix, readOnly = true }: LeuchteFormFieldsProps) => {
  const [form] = Form.useForm();
  const keyTablesData = useSelector(getKeyTablesData);

  // Key table options (sorted to match KeyTablesPage display order)
  const leuchttypOptions = useMemo(
    () =>
      sortOptions(
        (keyTablesData.leuchtentyp || []) as LeuchttypItem[],
        (item) => `${item.leuchtentyp || ""} ${item.fabrikat || ""}`.trim(),
        "alphabetical"
      ),
    [keyTablesData.leuchtentyp]
  );
  const kennzifferOptions = useMemo(
    () =>
      sortOptions(
        (keyTablesData.kennziffer || []) as KennzifferItem[],
        (item) => `${item.kennziffer || ""} - ${item.beschreibung || ""}`,
        "numeric"
      ),
    [keyTablesData.kennziffer]
  );
  const energielieferantOptions = useMemo(
    () =>
      sortOptions(
        (keyTablesData.energielieferant || []) as EnergielieferantItem[],
        (item) => item.energielieferant || "",
        "alphabetical"
      ),
    [keyTablesData.energielieferant]
  );
  const doppelkommandoOptions = useMemo(
    () =>
      sortOptions(
        (keyTablesData.doppelkommando || []) as DoppelkommandoItem[],
        (item) => `${item.pk || ""} - ${item.beschreibung || ""}`,
        "numeric"
      ),
    [keyTablesData.doppelkommando]
  );
  const unterhaltLeuchteOptions = useMemo(
    () =>
      sortOptions(
        (keyTablesData.unterhaltLeuchte || []) as UnterhaltLeuchteItem[],
        (item) =>
          `${item.pk ?? ""} - ${item.unterhaltspflichtiger_leuchte || ""}`,
        "numeric"
      ),
    [keyTablesData.unterhaltLeuchte]
  );
  const leuchtmittelOptions = (keyTablesData.leuchtmittel ||
    []) as LeuchtmittelItem[];
  const rundsteuerempfaengerOptions = useMemo(
    () =>
      sortOptions(
        (keyTablesData["rundsteuerempfänger"] ||
          []) as RundsteuerempfaengerItem[],
        (item) => `${item.rs_typ || ""}`,
        "alphabetical"
      ),
    [keyTablesData["rundsteuerempfänger"]]
  );

  // Helper to create field name with optional prefix
  const fieldName = (name: string) => (namePrefix ? [namePrefix, name] : name);

  useEffect(() => {
    // Reset form when data changes to clear old values
    form.resetFields();

    if (leuchte) {
      const strassenschluessel = leuchte.tkey_strassenschluessel as
        | NestedObject
        | undefined;
      const kennziffer = leuchte.tkey_kennziffer as NestedObject | undefined;
      const leuchtentyp = leuchte.tkey_leuchtentyp as NestedObject | undefined;
      const energielieferant = leuchte.tkey_energielieferant as
        | NestedObject
        | undefined;
      const rundsteuerempfaenger = leuchte.rundsteuerempfaengerObject as
        | NestedObject
        | undefined;
      const dk1Object = leuchte.fk_dk1Object as NestedObject | undefined;
      const dk2Object = leuchte.fk_dk2Object as NestedObject | undefined;
      const unterhLeuchte = leuchte.tkey_unterh_leuchte as
        | NestedObject
        | undefined;
      const leuchtmittelObj = leuchte.leuchtmittelObject as
        | NestedObject
        | undefined;

      form.setFieldsValue({
        // Straßenschlüssel
        strassenschluessel_pk: strassenschluessel?.pk,
        strassenschluessel_strasse: strassenschluessel?.strasse,
        // Kennziffer - use id for Select value
        fk_kennziffer: kennziffer?.id ?? null,
        // Laufende Nr. / Leuchtennummer
        lfd_nummer: leuchte.lfd_nummer,
        leuchtennummer: leuchte.leuchtennummer,
        // Leuchtentyp - use id for Select value
        fk_leuchttyp: leuchtentyp?.id ?? null,
        // Inbetriebnahme / Zähler
        inbetriebnahme_leuchte: leuchte.inbetriebnahme_leuchte
          ? dayjs(leuchte.inbetriebnahme_leuchte as string)
          : null,
        zaehler: leuchte.zaehler,
        // Montagefirma
        montagefirma_leuchte: leuchte.montagefirma_leuchte,
        // Energielieferant - use id for Select value
        fk_energielieferant: energielieferant?.id ?? null,
        // Schaltstelle
        schaltstelle: leuchte.schaltstelle,
        // Rundsteuerempfänger - use id for Select value
        fk_rundsteuerempfaenger: rundsteuerempfaenger?.id ?? null,
        // Einbaudatum
        einbaudatum: leuchte.einbaudatum
          ? dayjs(leuchte.einbaudatum as string)
          : null,
        // Doppelkommando 1 - use id for Select value
        fk_dk1: dk1Object?.id ?? leuchte.fk_dk1,
        anzahl_1dk: leuchte.anzahl_1dk,
        anschlussleistung_1dk: leuchte.anschlussleistung_1dk,
        // Doppelkommando 2 - use id for Select value
        fk_dk2: dk2Object?.id ?? leuchte.fk_dk2,
        anzahl_2dk: leuchte.anzahl_2dk,
        anschlussleistung_2dk: leuchte.anschlussleistung_2dk,
        // Unterhalt Leuchte - use id for Select value
        fk_unterhalt_leuchte: unterhLeuchte?.id ?? null,
        // Leuchtmittelwechsel
        wechseldatum: leuchte.wechseldatum
          ? dayjs(leuchte.wechseldatum as string)
          : null,
        naechster_wechsel: leuchte.naechster_wechsel
          ? dayjs(leuchte.naechster_wechsel as string)
          : null,
        // Leuchtmittel - use id for Select value
        fk_leuchtmittel: leuchtmittelObj?.id ?? leuchte.leuchtmittel,
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
  }, [leuchte, form]);

  return (
    <Form
      form={form}
      layout="vertical"
      requiredMark={false}
      className={getFormClassName(readOnly, "pr-2")}
    >
      {/* Straßenschlüssel - always disabled */}
      <StrassenschluesselFields namePrefix={namePrefix} />

      {/* Kennziffer */}
      <Form.Item
        name={fieldName("fk_kennziffer")}
        label={<FormLabel>Kennziffer</FormLabel>}
        className="mb-4"
      >
        <Select
          placeholder={getPlaceholder(readOnly, "Kennziffer auswählen")}
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
            name={fieldName("lfd_nummer")}
            label={<FormLabel>Laufende Nr.</FormLabel>}
            className="mb-4"
          >
            <InputNumber className="w-full" size="large" />
          </Form.Item>
        </Col>
        <Col span={12}>
          <Form.Item
            name={fieldName("leuchtennummer")}
            label={<FormLabel>Leuchtennummer</FormLabel>}
            className="mb-4"
          >
            <InputNumber className="w-full" size="large" />
          </Form.Item>
        </Col>
      </Row>

      {/* Leuchtentyp */}
      <Form.Item
        name={fieldName("fk_leuchttyp")}
        label={<FormLabel>Leuchtentyp</FormLabel>}
        className="mb-4"
      >
        <Select
          placeholder={getPlaceholder(readOnly, "Leuchtentyp auswählen")}
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
            name={fieldName("inbetriebnahme_leuchte")}
            label={<FormLabel>Inbetriebnahme</FormLabel>}
            className="mb-4"
          >
            <DatePicker
              className="w-full"
              size="large"
              format="DD.MM.YYYY"
              placeholder={getPlaceholder(readOnly, "Datum auswählen")}
            />
          </Form.Item>
        </Col>
        <Col span={12}>
          <Form.Item
            name={fieldName("zaehler")}
            valuePropName="checked"
            className="mb-4 mt-8"
          >
            <Checkbox>Zähler vorhanden</Checkbox>
          </Form.Item>
        </Col>
      </Row>

      {/* Montagefirma */}
      <Form.Item
        name={fieldName("montagefirma_leuchte")}
        label={<FormLabel>Montagefirma</FormLabel>}
        className="mb-4"
      >
        <Input size="large" />
      </Form.Item>

      {/* Energielieferant */}
      <Form.Item
        name={fieldName("fk_energielieferant")}
        label={<FormLabel>Energielieferant</FormLabel>}
        className="mb-4"
      >
        <Select
          placeholder={getPlaceholder(readOnly, "Energielieferant auswählen")}
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
        name={fieldName("schaltstelle")}
        label={<FormLabel>Schaltstelle</FormLabel>}
        className="mb-4"
      >
        <Input size="large" />
      </Form.Item>

      {/* Rundsteuerempfänger */}
      <Form.Item
        name={fieldName("fk_rundsteuerempfaenger")}
        label={<FormLabel>Rundsteuerempf.</FormLabel>}
        className="mb-4"
      >
        <Select
          placeholder={getPlaceholder(readOnly, "Rundsteuerempfänger auswählen")}
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
        name={fieldName("einbaudatum")}
        label={<FormLabel>Einbaudatum</FormLabel>}
        className="mb-4"
      >
        <DatePicker
          className="w-full"
          size="large"
          format="DD.MM.YYYY"
          placeholder={getPlaceholder(readOnly, "Datum auswählen")}
        />
      </Form.Item>

      {/* Doppelkommando 1 */}
      <Row gutter={16}>
        <Col span={16}>
          <Form.Item
            name={fieldName("fk_dk1")}
            label={<FormLabel>Doppelkommando 1</FormLabel>}
            className="mb-4"
          >
            <Select
              placeholder={getPlaceholder(readOnly, "Auswählen")}
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
            name={fieldName("anzahl_1dk")}
            label={<FormLabel>Anzahl</FormLabel>}
            className="mb-4"
          >
            <InputNumber className="w-full" size="large" />
          </Form.Item>
        </Col>
      </Row>

      {/* Anschlussleistung 1 */}
      <Form.Item
        name={fieldName("anschlussleistung_1dk")}
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
            name={fieldName("fk_dk2")}
            label={<FormLabel>Doppelkommando 2</FormLabel>}
            className="mb-4"
          >
            <Select
              placeholder={getPlaceholder(readOnly, "Auswählen")}
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
            name={fieldName("anzahl_2dk")}
            label={<FormLabel>Anzahl</FormLabel>}
            className="mb-4"
          >
            <InputNumber className="w-full" size="large" />
          </Form.Item>
        </Col>
      </Row>

      {/* Anschlussleistung 2 */}
      <Form.Item
        name={fieldName("anschlussleistung_2dk")}
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
        name={fieldName("fk_unterhalt_leuchte")}
        label={<FormLabel>Unterhalt Leuchte</FormLabel>}
        className="mb-4"
      >
        <Select
          placeholder={getPlaceholder(readOnly, "Auswählen")}
          className="w-full"
          size="large"
          showSearch
          optionFilterProp="children"
        >
          {unterhaltLeuchteOptions.map((item) => (
            <Select.Option key={item.id} value={item.id}>
              {item.pk} - {item.unterhaltspflichtiger_leuchte}
            </Select.Option>
          ))}
        </Select>
      </Form.Item>

      {/* Leuchtmittelwechsel / Nächster Wechsel */}
      <Row gutter={16}>
        <Col span={12}>
          <Form.Item
            name={fieldName("wechseldatum")}
            label={<FormLabel>Leuchtmittelwechsel</FormLabel>}
            className="mb-4"
          >
            <DatePicker
              className="w-full"
              size="large"
              format="DD.MM.YYYY"
              placeholder={getPlaceholder(readOnly, "Datum auswählen")}
            />
          </Form.Item>
        </Col>
        <Col span={12}>
          <Form.Item
            name={fieldName("naechster_wechsel")}
            label={<FormLabel>Nächster Wechsel</FormLabel>}
            className="mb-4"
          >
            <DatePicker
              className="w-full"
              size="large"
              format="DD.MM.YYYY"
              placeholder={getPlaceholder(readOnly, "Datum auswählen")}
            />
          </Form.Item>
        </Col>
      </Row>

      {/* Leuchtmittel */}
      <Form.Item
        name={fieldName("fk_leuchtmittel")}
        label={<FormLabel>Leuchtmittel</FormLabel>}
        className="mb-4"
      >
        <Select
          placeholder={getPlaceholder(readOnly, "Leuchtmittel auswählen")}
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
        name={fieldName("lebensdauer")}
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
        name={fieldName("sonderturnus")}
        label={<FormLabel>Sonderturnus</FormLabel>}
        className="mb-4"
      >
        <DatePicker
          className="w-full"
          size="large"
          format="DD.MM.YYYY"
          placeholder={getPlaceholder(readOnly, "Datum auswählen")}
        />
      </Form.Item>

      {/* Vorschaltgerät */}
      <Form.Item
        name={fieldName("vorschaltgeraet")}
        label={<FormLabel>Vorschaltgerät</FormLabel>}
        className="mb-4"
      >
        <Input size="large" />
      </Form.Item>

      {/* Erneuerung VG */}
      <Form.Item
        name={fieldName("wechselvorschaltgeraet")}
        label={<FormLabel>Erneuerung VG</FormLabel>}
        className="mb-4"
      >
        <DatePicker
          className="w-full"
          size="large"
          format="DD.MM.YYYY"
          placeholder={getPlaceholder(readOnly, "Datum auswählen")}
        />
      </Form.Item>

      {/* Bemerkung */}
      <Form.Item
        name={fieldName("bemerkungen")}
        label={<FormLabel>Bemerkung</FormLabel>}
        className="mb-4"
      >
        <Input.TextArea rows={4} size="large" />
      </Form.Item>
    </Form>
  );
};

export default LeuchteFormFields;
