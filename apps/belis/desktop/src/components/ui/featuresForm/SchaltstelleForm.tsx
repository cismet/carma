import { useEffect, useState } from "react";
import { Form, Row, Col, Select, Input, DatePicker, InputNumber } from "antd";
import type { UploadFile } from "antd";
import { useSelector } from "react-redux";
import { getKeyTablesData } from "../../../store/slices/keyTables";
import { getJWT } from "../../../store/slices/auth";
import { DokumentItem } from "../DocumentPreview";
import FeatureFormLayout from "./FeatureFormLayout";
import StrassenschluesselFields from "./StrassenschluesselFields";
import { getFormClassName, getPlaceholder } from "./readOnlyFormUtils";
import dayjs from "dayjs";

interface SchaltstelleFormProps {
  data: Record<string, unknown> | null;
  rawFeature?: { properties?: Record<string, unknown> } | null;
  onClose?: () => void;
  readOnly?: boolean;
  loading?: boolean;
}

interface BauartItem {
  id: number;
  bezeichnung?: string;
}

interface RundsteuerempfaengerItem {
  id: number;
  rs_typ?: string;
}

const SchaltstelleForm = ({
  data,
  rawFeature,
  onClose,
  readOnly = true,
  loading,
}: SchaltstelleFormProps) => {
  const [form] = Form.useForm();
  const [pendingFiles, setPendingFiles] = useState<UploadFile[]>([]);
  const keyTablesData = useSelector(getKeyTablesData);
  const jwt = useSelector(getJWT);

  // Key table options - sorted alphabetically
  const bauartOptions = [
    ...((keyTablesData.bauart || []) as BauartItem[]),
  ].sort((a, b) => (a.bezeichnung || "").localeCompare(b.bezeichnung || ""));
  const rundsteuerempfaengerOptions = [
    ...((keyTablesData["rundsteuerempfänger"] ||
      []) as RundsteuerempfaengerItem[]),
  ].sort((a, b) => (a.rs_typ || "").localeCompare(b.rs_typ || ""));

  // Extract documents from schaltstelle[0].dokumenteArray
  const schaltstelleData = data as Record<string, unknown>;
  const schaltstelleArray = schaltstelleData?.schaltstelle as
    | Array<Record<string, unknown>>
    | undefined;
  const documents: DokumentItem[] =
    (schaltstelleArray?.[0]?.dokumenteArray as DokumentItem[]) || [];

  // Extract subtitle - use rawFeature (vector tile) to match list display
  const rawProps = rawFeature?.properties;
  const subtitle =
    (rawProps?.bauart_bezeichnung as string) ||
    (rawProps?.bezeichnung as string) ||
    "-ohne Bezeichnung-";

  useEffect(() => {
    // Reset form when data changes to clear old values
    form.resetFields();

    if (data) {
      const schaltstelleData = data as Record<string, unknown>;
      const { schaltstelle } = schaltstelleData;
      if (
        !schaltstelle ||
        !Array.isArray(schaltstelle) ||
        schaltstelle.length === 0
      ) {
        return;
      }
      const ss = schaltstelle[0];
      form.setFieldsValue({
        // Strassenschluessel
        strassenschluessel_pk: ss.tkey_strassenschluessel?.pk,
        strassenschluessel_strasse: ss.tkey_strassenschluessel?.strasse,
        // Hausnummer
        haus_nummer: ss.haus_nummer,
        // Standortbez.
        zusaetzliche_standortbezeichnung: ss.zusaetzliche_standortbezeichnung,
        // Laufende Nr.
        laufende_nummer: ss.laufende_nummer,
        // Schaltstellen Nr.
        schaltstellen_nummer: ss.schaltstellen_nummer,
        // Bauart - use id for Select value
        fk_bauart: ss.bauart?.id ?? null,
        // Erstellungsjahr - parse as date string
        erstellungsjahr: ss.erstellungsjahr
          ? dayjs(ss.erstellungsjahr as string)
          : null,
        // Rundsteuerempfaenger - use id for Select value
        fk_rundsteuerempfaenger: ss.rundsteuerempfaengerObject?.id ?? null,
        // Einbaudatum
        einbaudatum_rs: ss.einbaudatum_rs
          ? dayjs(ss.einbaudatum_rs as string)
          : null,
        // Pruefung
        pruefdatum: ss.pruefdatum ? dayjs(ss.pruefdatum as string) : null,
        // Bemerkung
        bemerkung: ss.bemerkung,
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
      title="Schaltstelle"
      subtitle={subtitle}
      documents={documents}
      jwt={jwt}
      pendingFiles={pendingFiles}
      onFilesChange={setPendingFiles}
      debugData={data}
      loading={loading}
    >
      <Form
        form={form}
        layout="vertical"
        requiredMark={false}
        className={getFormClassName(readOnly, "pr-2")}
      >
        {/* Strassenschluessel - always disabled */}
        <StrassenschluesselFields label="Strassenschlussel" />

        {/* Hausnummer */}
        <Form.Item
          name="haus_nummer"
          label={<FormLabel>Hausnummer</FormLabel>}
          className="mb-4"
        >
          <Input size="large" />
        </Form.Item>

        {/* Standortbez. */}
        <Form.Item
          name="zusaetzliche_standortbezeichnung"
          label={<FormLabel>Standortbez.</FormLabel>}
          className="mb-4"
        >
          <Input size="large" />
        </Form.Item>

        {/* Laufende Nr. and Schaltstellen Nr. */}
        <Row gutter={16}>
          <Col span={12}>
            <Form.Item
              name="laufende_nummer"
              label={<FormLabel>Laufende Nr.</FormLabel>}
              className="mb-4"
            >
              <InputNumber className="w-full" size="large" />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item
              name="schaltstellen_nummer"
              label={<FormLabel>Schaltstellen Nr.</FormLabel>}
              className="mb-4"
            >
              <Input size="large" />
            </Form.Item>
          </Col>
        </Row>

        {/* Bauart */}
        <Form.Item
          name="fk_bauart"
          label={<FormLabel>Bauart</FormLabel>}
          className="mb-4"
        >
          <Select
            placeholder={getPlaceholder(readOnly, "Bauart auswahlen")}
            className="w-full"
            size="large"
            showSearch
            optionFilterProp="children"
          >
            {bauartOptions.map((item) => (
              <Select.Option key={item.id} value={item.id}>
                {item.bezeichnung}
              </Select.Option>
            ))}
          </Select>
        </Form.Item>

        {/* Erstellungsjahr */}
        <Form.Item
          name="erstellungsjahr"
          label={<FormLabel>Erstellungsjahr</FormLabel>}
          className="mb-4"
        >
          <DatePicker
            className="w-full"
            size="large"
            format="DD.MM.YYYY"
            placeholder={getPlaceholder(readOnly, "Datum auswahlen")}
          />
        </Form.Item>

        {/* Rundsteuerempfaenger */}
        <Form.Item
          name="fk_rundsteuerempfaenger"
          label={<FormLabel>Rundsteuerempf.</FormLabel>}
          className="mb-4"
        >
          <Select
            placeholder={getPlaceholder(readOnly, "Rundsteuerempfanger auswahlen")}
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

        {/* Einbaudatum and Pruefung */}
        <Row gutter={16}>
          <Col span={12}>
            <Form.Item
              name="einbaudatum_rs"
              label={<FormLabel>Einbaudatum</FormLabel>}
              className="mb-4"
            >
              <DatePicker
                className="w-full"
                size="large"
                format="DD.MM.YYYY"
                placeholder={getPlaceholder(readOnly, "Datum auswahlen")}
              />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item
              name="pruefdatum"
              label={<FormLabel>Prufung</FormLabel>}
              className="mb-4"
            >
              <DatePicker
                className="w-full"
                size="large"
                format="DD.MM.YYYY"
                placeholder={getPlaceholder(readOnly, "Datum auswahlen")}
              />
            </Form.Item>
          </Col>
        </Row>

        {/* Bemerkung */}
        <Form.Item
          name="bemerkung"
          label={<FormLabel>Bemerkung</FormLabel>}
          className="mb-4"
        >
          <Input.TextArea rows={4} size="large" />
        </Form.Item>
      </Form>
    </FeatureFormLayout>
  );
};

export default SchaltstelleForm;
