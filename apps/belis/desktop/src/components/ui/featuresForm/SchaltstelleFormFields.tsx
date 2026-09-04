import { useEffect, useRef } from "react";
import { Form, Row, Col, Select, Input, DatePicker, InputNumber } from "antd";
import type { FormInstance } from "antd";
import { useSelector } from "react-redux";
import dayjs from "dayjs";
import { getKeyTablesData } from "../../../store/slices/keyTables";
import StrassenschluesselFields from "./StrassenschluesselFields";
import StrassenschluesselFieldsModal from "./StrassenschluesselFieldsModal";
import { getFormClassName, getPlaceholder } from "./readOnlyFormUtils";
import { FormItem } from "./DraftFieldHighlight";
import toTitleCase from "../../../helper/toTitleCase";
import {
  formatSensorbetreiber,
  syncSensorbetreiber,
  useSensorbetreiber,
} from "./sensorFields";

interface SchaltstelleFormFieldsProps {
  schaltstelle: Record<string, unknown> | null;
  readOnly?: boolean;
  isCreation?: boolean;
  featureId?: string;
  geometrySelector?: React.ReactNode;
  form?: FormInstance;
  onFormInstance?: (form: FormInstance) => void;
  draftValues?: Record<string, unknown>;
  onValuesChange?: (
    changedValues: Record<string, unknown>,
    allValues: Record<string, unknown>
  ) => void;
  onOriginalValues?: (values: Record<string, unknown>) => void;
}

interface BauartItem {
  id: number;
  bezeichnung?: string;
}

interface RundsteuerempfaengerItem {
  id: number;
  rs_typ?: string;
}

const FormLabel = ({ children }: { children: React.ReactNode }) => (
  <span className="text-sm font-medium text-gray-700">{children}</span>
);

const SchaltstelleFormFields = ({
  schaltstelle,
  readOnly = true,
  featureId,
  geometrySelector,
  form: externalForm,
  onFormInstance,
  draftValues,
  onValuesChange,
  onOriginalValues,
}: SchaltstelleFormFieldsProps) => {
  const [localForm] = Form.useForm();
  const form = externalForm ?? localForm;
  const draftApplied = useRef(false);
  const onValuesChangeRef = useRef(onValuesChange);
  useEffect(() => {
    onValuesChangeRef.current = onValuesChange;
  }, [onValuesChange]);
  const appliedForFeatureRef = useRef<string | number | undefined>(undefined);
  useEffect(() => {
    if (!externalForm) onFormInstance?.(form);
  }, [form, onFormInstance, externalForm]);

  const keyTablesData = useSelector(getKeyTablesData);

  // Key table options - sorted alphabetically
  const bauartOptions = [
    ...((keyTablesData.bauart || []) as BauartItem[]),
  ].sort((a, b) => (a.bezeichnung || "").localeCompare(b.bezeichnung || ""));
  const rundsteuerempfaengerOptions = [
    ...((keyTablesData["rundsteuerempfänger"] ||
      []) as RundsteuerempfaengerItem[]),
  ].sort((a, b) => (a.rs_typ || "").localeCompare(b.rs_typ || ""));
  const { options: sensorbetreiberOptions, esaveId } = useSensorbetreiber();

  useEffect(() => {
    if (externalForm) return;
    if (!schaltstelle) return;

    const featureChanged = appliedForFeatureRef.current !== featureId;
    const isCreationFeature = String(featureId ?? "").startsWith("create:");

    // During creation, the synthetic record gets a fresh reference per
    // keystroke. Re-running with the same featureId would call resetFields()
    // and steal focus. Bail unless this is the first arrival for this draft.
    if (!featureChanged && isCreationFeature) return;

    if (featureChanged) {
      // First time we see this feature — clear any stale state. For post-save
      // refresh on the same feature, skip resetFields so AntD keeps the DOM
      // intact (preserves scroll position and focus).
      form.resetFields();
      draftApplied.current = false;
    }

    const ss = schaltstelle;
    const tkey = ss.tkey_strassenschluessel as
      | { pk?: string; strasse?: string }
      | undefined;
    const serverValues = {
      // Strassenschluessel
      strassenschluessel_pk: tkey?.pk,
      strassenschluessel_strasse: tkey?.strasse
        ? toTitleCase(tkey.strasse)
        : undefined,
      // Hausnummer
      haus_nummer: ss.haus_nummer,
      // Standortbez.
      zusaetzliche_standortbezeichnung: ss.zusaetzliche_standortbezeichnung,
      // Laufende Nr.
      laufende_nummer: ss.laufende_nummer,
      // Schaltstellen Nr.
      schaltstellen_nummer: ss.schaltstellen_nummer,
      // Bauart - use id for Select value
      fk_bauart: (ss.bauart as { id?: number } | undefined)?.id ?? null,
      // Erstellungsjahr - parse as date string
      erstellungsjahr: ss.erstellungsjahr
        ? dayjs(ss.erstellungsjahr as string)
        : null,
      // Rundsteuerempfaenger - use id for Select value
      rundsteuerempfaenger:
        (ss.rundsteuerempfaengerObject as { id?: number } | undefined)?.id ??
        null,
      // Einbaudatum
      einbaudatum_rs: ss.einbaudatum_rs
        ? dayjs(ss.einbaudatum_rs as string)
        : null,
      // Pruefung
      pruefdatum: ss.pruefdatum ? dayjs(ss.pruefdatum as string) : null,
      // Sensor (esave)
      sensorid: ss.sensorid,
      sensorbetreiber:
        (ss.sensorbetreiberObject as { id?: number } | undefined)?.id ??
        ss.sensorbetreiber ??
        null,
      // Bemerkung
      bemerkung: ss.bemerkung,
    };
    form.setFieldsValue(serverValues);
    onOriginalValues?.(form.getFieldsValue());

    if (draftValues) {
      form.setFieldsValue(draftValues);
      draftApplied.current = true;
    }

    appliedForFeatureRef.current = featureId;
    // Depend on the `schaltstelle` reference so post-save refetches re-populate
    // automatically; the featureChanged/isCreationFeature guards above filter
    // out the synthetic-record churn during creation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [featureId, schaltstelle, form]);

  useEffect(() => {
    if (externalForm) return;
    if (draftApplied.current || !draftValues) return;
    form.setFieldsValue(draftValues);
    draftApplied.current = true;
  }, [draftValues, form, externalForm]);

  const handleSensorIdChange = (value: string) =>
    syncSensorbetreiber({
      value,
      form,
      name: "sensorbetreiber",
      esaveId,
      notify: onValuesChangeRef.current,
    });

  return (
    <Form
      form={form}
      layout="vertical"
      requiredMark={false}
      className={getFormClassName(readOnly, "pr-2")}
      onValuesChange={onValuesChange}
    >
      {geometrySelector}

      {!readOnly ? (
        <StrassenschluesselFieldsModal
          label="Strassenschlussel"
          onSyncDerivedValues={onValuesChange}
        />
      ) : (
        <StrassenschluesselFields label="Strassenschlussel" />
      )}

      {/* Hausnummer */}
      <FormItem
        name="haus_nummer"
        label={<FormLabel>Hausnummer</FormLabel>}
        className="mb-4"
      >
        <Input
          size="large"
          placeholder={getPlaceholder(readOnly, "Hausnummer eingeben")}
        />
      </FormItem>

      {/* Standortbez. */}
      <FormItem
        name="zusaetzliche_standortbezeichnung"
        label={<FormLabel>Standortbez.</FormLabel>}
        className="mb-4"
      >
        <Input
          size="large"
          placeholder={getPlaceholder(readOnly, "Standortbezeichnung eingeben")}
        />
      </FormItem>

      {/* Laufende Nr. and Schaltstellen Nr. */}
      <Row gutter={16}>
        <Col span={12}>
          <FormItem
            name="laufende_nummer"
            label={<FormLabel>Laufende Nr.</FormLabel>}
            className="mb-4"
          >
            <InputNumber
              className="w-full"
              size="large"
              placeholder={getPlaceholder(readOnly, "Nummer eingeben")}
            />
          </FormItem>
        </Col>
        <Col span={12}>
          <FormItem
            name="schaltstellen_nummer"
            label={<FormLabel>Schaltstellen Nr.</FormLabel>}
            className="mb-4"
          >
            <Input
              size="large"
              placeholder={getPlaceholder(readOnly, "Nummer eingeben")}
            />
          </FormItem>
        </Col>
      </Row>

      {/* Bauart */}
      <FormItem
        name="fk_bauart"
        label={<FormLabel>Bauart</FormLabel>}
        className="mb-4"
      >
        <Select
          placeholder={getPlaceholder(readOnly, "Bauart auswählen")}
          className="w-full"
          size="large"
          allowClear
          showSearch
          optionFilterProp="children"
        >
          {bauartOptions.map((item) => (
            <Select.Option key={item.id} value={item.id}>
              {item.bezeichnung}
            </Select.Option>
          ))}
        </Select>
      </FormItem>

      {/* Erstellungsjahr */}
      <FormItem
        name="erstellungsjahr"
        label={<FormLabel>Erstellungsjahr</FormLabel>}
        className="mb-4"
      >
        <DatePicker
          className="w-full"
          size="large"
          format="DD.MM.YYYY"
          placeholder={getPlaceholder(readOnly, "Datum auswählen")}
        />
      </FormItem>

      {/* Rundsteuerempfaenger */}
      <FormItem
        name="rundsteuerempfaenger"
        label={<FormLabel>Rundsteuerempf.</FormLabel>}
        className="mb-4"
      >
        <Select
          placeholder={getPlaceholder(
            readOnly,
            "Rundsteuerempfänger auswählen"
          )}
          className="w-full"
          size="large"
          allowClear
          showSearch
          optionFilterProp="children"
        >
          {rundsteuerempfaengerOptions.map((item) => (
            <Select.Option key={item.id} value={item.id}>
              {item.rs_typ}
            </Select.Option>
          ))}
        </Select>
      </FormItem>

      {/* Sensor (esave) */}
      <Row gutter={16}>
        <Col span={8}>
          <FormItem
            name="sensorid"
            label={<FormLabel>Sensor-ID</FormLabel>}
            className="mb-4"
          >
            <Input
              size="large"
              placeholder={getPlaceholder(readOnly, "Sensor-ID eingeben")}
              onChange={(e) => handleSensorIdChange(e.target.value)}
            />
          </FormItem>
        </Col>
        <Col span={16}>
          <FormItem
            name="sensorbetreiber"
            label={<FormLabel>Sensorbetreiber</FormLabel>}
            className="mb-4"
          >
            <Select
              placeholder={getPlaceholder(
                readOnly,
                "Sensorbetreiber auswählen"
              )}
              className="w-full"
              size="large"
              allowClear
              showSearch
              optionFilterProp="children"
            >
              {sensorbetreiberOptions.map((item) => (
                <Select.Option key={item.id} value={item.id}>
                  {formatSensorbetreiber(item)}
                </Select.Option>
              ))}
            </Select>
          </FormItem>
        </Col>
      </Row>

      {/* Einbaudatum and Pruefung */}
      <Row gutter={16}>
        <Col span={12}>
          <FormItem
            name="einbaudatum_rs"
            label={<FormLabel>Einbaudatum</FormLabel>}
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
            name="pruefdatum"
            label={<FormLabel>Prüfung</FormLabel>}
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

      {/* Bemerkung */}
      <FormItem
        name="bemerkung"
        label={<FormLabel>Bemerkung</FormLabel>}
        className="mb-4"
      >
        <Input.TextArea
          rows={4}
          size="large"
          placeholder={getPlaceholder(readOnly, "Bemerkung eingeben")}
        />
      </FormItem>
    </Form>
  );
};

export default SchaltstelleFormFields;
