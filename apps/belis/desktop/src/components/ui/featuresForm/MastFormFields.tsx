import { useEffect } from "react";
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
import StadtbezirkField from "./StadtbezirkField";
import { getFormClassName, getPlaceholder } from "./readOnlyFormUtils";
import { FormItem } from "./DraftFieldHighlight";
import toTitleCase from "../../../helper/toTitleCase";
import dayjs from "dayjs";

interface MastFormFieldsProps {
  mast: Record<string, unknown> | null;
  namePrefix?: string;
  readOnly?: boolean;
  onFormInstance?: (form: import("antd").FormInstance) => void;
  draftValues?: Record<string, unknown>;
  onValuesChange?: (
    changedValues: Record<string, unknown>,
    allValues: Record<string, unknown>
  ) => void;
  onOriginalValues?: (values: Record<string, unknown>) => void;
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

// Helper type for nested objects with common properties
interface NestedObject {
  id?: number;
  pk?: string;
  strasse?: string;
}

const FormLabel = ({ children }: { children: React.ReactNode }) => (
  <span className="text-sm font-medium text-gray-700">{children}</span>
);

const MastFormFields = ({
  mast,
  namePrefix,
  readOnly = true,
  onFormInstance,
  draftValues,
  onValuesChange,
  onOriginalValues,
}: MastFormFieldsProps) => {
  const [form] = Form.useForm();
  useEffect(() => {
    onFormInstance?.(form);
  }, [form, onFormInstance]);
  const keyTablesData = useSelector(getKeyTablesData);

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
  ].sort((a, b) => Number(a.pk ?? 0) - Number(b.pk ?? 0));
  const kennzifferOptions = (keyTablesData.kennziffer ||
    []) as KennzifferItem[];
  const anlagengruppeOptions = (keyTablesData.anlagengruppe ||
    []) as AnlagengruppeItem[];

  // Helper to create field name with optional prefix
  const fieldName = (name: string) => (namePrefix ? [namePrefix, name] : name);

  useEffect(() => {
    // Reset form when data changes to clear old values
    form.resetFields();

    if (mast) {
      const strassenschluessel = mast.tkey_strassenschluessel as
        | NestedObject
        | undefined;
      const kennziffer = mast.tkey_kennziffer as NestedObject | undefined;
      const bezirk = mast.tkey_bezirk as NestedObject | undefined;
      const mastart = mast.tkey_mastart as NestedObject | undefined;
      const masttyp = mast.tkey_masttyp as NestedObject | undefined;
      const klassifizierung = mast.tkey_klassifizierung as
        | NestedObject
        | undefined;
      const unterhMast = mast.tkey_unterh_mast as NestedObject | undefined;
      const anlagengruppeObj = mast.anlagengruppeObject as
        | NestedObject
        | undefined;

      const serverValues = {
        // Strassenschluessel
        strassenschluessel_pk: strassenschluessel?.pk,
        strassenschluessel_strasse: toTitleCase(
          strassenschluessel?.strasse || ""
        ),
        // Kennziffer - use id for Select value
        fk_kennziffer: kennziffer?.id ?? null,
        // Laufende Nr.
        lfd_nummer: mast.lfd_nummer,
        // Hausnummer
        haus_nr: mast.haus_nr,
        // Standortangabe
        standortangabe: toTitleCase((mast.standortangabe as string) || ""),
        // Stadtbezirk - use id for Select value
        fk_stadtbezirk: bezirk?.id ?? null,
        // Mastart - use id for Select value
        fk_mastart: mastart?.id ?? null,
        // Masttyp - use id for Select value
        fk_masttyp: masttyp?.id ?? null,
        // Klassifizierung - use id for Select value
        fk_klassifizierung: klassifizierung?.id ?? null,
        // Unterhalt - use id for Select value
        fk_unterhaltspflicht_mast: unterhMast?.id ?? null,
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
        mastschutz: mast.mastschutz ? dayjs(mast.mastschutz as string) : null,
        // Revision
        revision: mast.revision ? dayjs(mast.revision as string) : null,
        // Anlagengruppe - use id for Select value
        anlagengruppe: anlagengruppeObj?.id ?? mast.anlagengruppe,
        // Anbauten
        anbauten: mast.anbauten,
        // Bemerkungen
        bemerkungen: mast.bemerkungen,
        // Letzte Aenderung
        letzte_aenderung: mast.letzte_aenderung
          ? dayjs(mast.letzte_aenderung as string)
          : null,
      };
      form.setFieldsValue(serverValues);
      onOriginalValues?.(form.getFieldsValue());

      if (draftValues) {
        form.setFieldsValue(draftValues);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mast, form]);

  return (
    <Form
      form={form}
      layout="vertical"
      requiredMark={false}
      className={getFormClassName(readOnly, "pr-2")}
      onValuesChange={onValuesChange}
    >
      {/* Strassenschluessel - always disabled */}
      <StrassenschluesselFields namePrefix={namePrefix} />

      {/* Kennziffer */}
      <FormItem
        name={fieldName("fk_kennziffer")}
        label={<FormLabel>Kennziffer</FormLabel>}
        className="mb-4"
      >
        <Select
          placeholder={getPlaceholder(readOnly, "Kennziffer auswählen")}
          className="w-full"
          size="large"
          allowClear
          showSearch
          optionFilterProp="children"
        >
          {kennzifferOptions.map((item) => (
            <Select.Option key={item.id} value={item.id}>
              {item.kennziffer} - {item.beschreibung}
            </Select.Option>
          ))}
        </Select>
      </FormItem>

      {/* Laufende Nr. and Hausnummer */}
      <Row gutter={16}>
        <Col span={12}>
          <FormItem
            name={fieldName("lfd_nummer")}
            label={<FormLabel>Laufende Nr.</FormLabel>}
            className="mb-4"
          >
            <InputNumber className="w-full" size="large" />
          </FormItem>
        </Col>
        <Col span={12}>
          <FormItem
            name={fieldName("haus_nr")}
            label={<FormLabel>Hausnummer</FormLabel>}
            className="mb-4"
          >
            <Input size="large" />
          </FormItem>
        </Col>
      </Row>

      {/* Standortangabe */}
      <FormItem
        name={fieldName("standortangabe")}
        label={<FormLabel>Standortangabe</FormLabel>}
        className="mb-4"
      >
        <Input size="large" />
      </FormItem>

      {/* Stadtbezirk - always non-editable (reference data) */}
      <StadtbezirkField
        namePrefix={namePrefix}
        readOnly={readOnly}
        locked={false}
      />

      {/* Mastart */}
      <FormItem
        name={fieldName("fk_mastart")}
        label={<FormLabel>Mastart</FormLabel>}
        className="mb-4"
      >
        <Select
          placeholder={getPlaceholder(readOnly, "Mastart auswählen")}
          className="w-full"
          size="large"
          allowClear
          showSearch
          optionFilterProp="children"
        >
          {mastartOptions.map((item) => (
            <Select.Option key={item.id} value={item.id}>
              {item.mastart}
            </Select.Option>
          ))}
        </Select>
      </FormItem>

      {/* Masttyp */}
      <FormItem
        name={fieldName("fk_masttyp")}
        label={<FormLabel>Masttyp</FormLabel>}
        className="mb-4"
      >
        <Select
          placeholder={getPlaceholder(readOnly, "Masttyp auswählen")}
          className="w-full"
          size="large"
          allowClear
          showSearch
          optionFilterProp="children"
        >
          {masttypOptions.map((item) => (
            <Select.Option key={item.id} value={item.id}>
              {item.masttyp} {item.bezeichnung}
            </Select.Option>
          ))}
        </Select>
      </FormItem>

      {/* Klassifizierung */}
      <FormItem
        name={fieldName("fk_klassifizierung")}
        label={<FormLabel>Klassifizierung</FormLabel>}
        className="mb-4"
      >
        <Select
          placeholder={getPlaceholder(readOnly, "Klassifizierung auswählen")}
          className="w-full"
          size="large"
          allowClear
          showSearch
          optionFilterProp="children"
        >
          {klassifizierungOptions.map((item) => (
            <Select.Option key={item.id} value={item.id}>
              {item.klassifizierung}
            </Select.Option>
          ))}
        </Select>
      </FormItem>

      {/* Unterhalt */}
      <FormItem
        name={fieldName("fk_unterhaltspflicht_mast")}
        label={<FormLabel>Unterhalt</FormLabel>}
        className="mb-4"
      >
        <Select
          placeholder={getPlaceholder(readOnly, "Unterhalt auswählen")}
          className="w-full"
          size="large"
          allowClear
          showSearch
          optionFilterProp="children"
        >
          {unterhaltMastOptions.map((item) => (
            <Select.Option key={item.id} value={item.id}>
              {item.pk} - {item.unterhalt_mast}
            </Select.Option>
          ))}
        </Select>
      </FormItem>

      {/* Inbetriebnahme and V-Einheit */}
      <Row gutter={16}>
        <Col span={12}>
          <FormItem
            name={fieldName("inbetriebnahme_mast")}
            label={<FormLabel>Inbetriebnahme</FormLabel>}
            className="mb-4"
          >
            <DatePicker
              className="w-full"
              size="large"
              format="DD.MM.YYYY"
              placeholder={getPlaceholder(readOnly, "Datum auswählen")}
            />
          </FormItem>
        </Col>
        <Col span={12}>
          <FormItem
            name={fieldName("verrechnungseinheit")}
            valuePropName="checked"
            className="mb-4 mt-8"
          >
            <Checkbox>V-Einheit</Checkbox>
          </FormItem>
        </Col>
      </Row>

      {/* Mastanstrich and Anstrichfarbe */}
      <Row gutter={16}>
        <Col span={12}>
          <FormItem
            name={fieldName("mastanstrich")}
            label={<FormLabel>Mastanstrich</FormLabel>}
            className="mb-4"
          >
            <DatePicker
              className="w-full"
              size="large"
              format="DD.MM.YYYY"
              placeholder={getPlaceholder(readOnly, "Datum auswählen")}
            />
          </FormItem>
        </Col>
        <Col span={12}>
          <FormItem
            name={fieldName("anstrichfarbe")}
            label={<FormLabel>Anstrichfarbe</FormLabel>}
            className="mb-4"
          >
            <Input size="large" />
          </FormItem>
        </Col>
      </Row>

      {/* Montagefirma */}
      <FormItem
        name={fieldName("montagefirma")}
        label={<FormLabel>Montagefirma</FormLabel>}
        className="mb-4"
      >
        <Input size="large" />
      </FormItem>

      {/* Gruendung */}
      <FormItem
        name={fieldName("gruendung")}
        label={<FormLabel>Gründung</FormLabel>}
        className="mb-4"
      >
        <Input size="large" />
      </FormItem>

      {/* Standsicherheitspruefung and Naechstes Pruefdatum */}
      <Row gutter={16}>
        <Col span={12}>
          <FormItem
            name={fieldName("standsicherheitspruefung")}
            label={<FormLabel>Standsicherheitsprfg.</FormLabel>}
            className="mb-4"
          >
            <DatePicker
              className="w-full"
              size="large"
              format="DD.MM.YYYY"
              placeholder={getPlaceholder(readOnly, "Datum auswählen")}
            />
          </FormItem>
        </Col>
        <Col span={12}>
          <FormItem
            name={fieldName("naechstes_pruefdatum")}
            label={<FormLabel>Nächstes Prüfdatum</FormLabel>}
            className="mb-4"
          >
            <DatePicker
              className="w-full"
              size="large"
              format="DD.MM.YYYY"
              placeholder={getPlaceholder(readOnly, "Datum auswählen")}
            />
          </FormItem>
        </Col>
      </Row>

      {/* Verfahren */}
      <FormItem
        name={fieldName("verfahren")}
        label={<FormLabel>Verfahren</FormLabel>}
        className="mb-4"
      >
        <Input size="large" />
      </FormItem>

      {/* Elektrische Pruefung and Erdung */}
      <Row gutter={16}>
        <Col span={12}>
          <FormItem
            name={fieldName("elek_pruefung")}
            label={<FormLabel>Elektrische Prüfung</FormLabel>}
            className="mb-4"
          >
            <DatePicker
              className="w-full"
              size="large"
              format="DD.MM.YYYY"
              placeholder={getPlaceholder(readOnly, "Datum auswählen")}
            />
          </FormItem>
        </Col>
        <Col span={12}>
          <FormItem
            name={fieldName("erdung")}
            valuePropName="checked"
            className="mb-4 mt-8"
          >
            <Checkbox>Erdung i.O.</Checkbox>
          </FormItem>
        </Col>
      </Row>

      {/* Monteur */}
      <FormItem
        name={fieldName("monteur")}
        label={<FormLabel>Monteur</FormLabel>}
        className="mb-4"
      >
        <Input size="large" />
      </FormItem>

      {/* Mastschutz and Revision */}
      <Row gutter={16}>
        <Col span={12}>
          <FormItem
            name={fieldName("mastschutz")}
            label={<FormLabel>Mastschutz</FormLabel>}
            className="mb-4"
          >
            <DatePicker
              className="w-full"
              size="large"
              format="DD.MM.YYYY"
              placeholder={getPlaceholder(readOnly, "Datum auswählen")}
            />
          </FormItem>
        </Col>
        <Col span={12}>
          <FormItem
            name={fieldName("revision")}
            label={<FormLabel>Revision</FormLabel>}
            className="mb-4"
          >
            <DatePicker
              className="w-full"
              size="large"
              format="DD.MM.YYYY"
              placeholder={getPlaceholder(readOnly, "Datum auswählen")}
            />
          </FormItem>
        </Col>
      </Row>

      {/* Anlagengruppe */}
      <FormItem
        name={fieldName("anlagengruppe")}
        label={<FormLabel>Anlagengruppe</FormLabel>}
        className="mb-4"
      >
        <Select
          placeholder={getPlaceholder(readOnly, "Anlagengruppe auswählen")}
          className="w-full"
          size="large"
          allowClear
          showSearch
          optionFilterProp="children"
        >
          {anlagengruppeOptions.map((item) => (
            <Select.Option key={item.id} value={item.id}>
              {item.nummer} - {item.bezeichnung}
            </Select.Option>
          ))}
        </Select>
      </FormItem>

      {/* Anbauten */}
      <FormItem
        name={fieldName("anbauten")}
        label={<FormLabel>Anbauten</FormLabel>}
        className="mb-4"
      >
        <Input size="large" />
      </FormItem>

      {/* Bemerkung */}
      <FormItem
        name={fieldName("bemerkungen")}
        label={<FormLabel>Bemerkung</FormLabel>}
        className="mb-4"
      >
        <Input.TextArea rows={4} size="large" />
      </FormItem>

      {/* Letzte Aenderung (readonly) */}
      <FormItem
        name={fieldName("letzte_aenderung")}
        label={<FormLabel>Letzte Änderung</FormLabel>}
        className="mb-4"
      >
        <DatePicker
          className="w-full"
          size="large"
          format="DD.MM.YYYY"
          placeholder={getPlaceholder(readOnly, "Datum auswählen")}
        />
      </FormItem>
    </Form>
  );
};

export default MastFormFields;
