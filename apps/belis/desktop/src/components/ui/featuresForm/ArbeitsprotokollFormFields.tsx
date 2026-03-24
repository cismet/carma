import { useEffect, useMemo } from "react";
import { Form, Input, Row, Col, Table, Tag, DatePicker } from "antd";
import dayjs from "dayjs";
import type { ColumnsType } from "antd/es/table";
import { getFormClassName } from "./readOnlyFormUtils";
import { FormItem } from "./DraftFieldHighlight";

const FormLabel = ({ children }: { children: React.ReactNode }) => (
  <span className="text-sm font-medium text-gray-700">{children}</span>
);

const AKTIONEN_BY_FACHOBJEKT_TYPE: Record<string, string[]> = {
  tdta_leuchten: [
    "Sonderturnus",
    "Leuchtenerneuerung",
    "Leuchtmittelwechsel",
    "Leuchtmittelwechsel (mit EP)",
    "Vorschaltgerätwechsel",
    "Rundsteuerempfängerwechsel",
    "Sonstiges",
  ],
  tdta_standort_mast: [
    "Elektrische Prüfung",
    "Revision",
    "Masterneuerung",
    "Anstricharbeiten",
    "Standsicherheitsprüfung",
    "Sonstiges",
  ],
  schaltstelle: ["Revision", "Sonstiges"],
  mauerlasche: ["Prüfung", "Sonstiges"],
  abzweigdose: ["Sonstiges"],
  leitung: ["Sonstiges"],
  geom: ["Sonstiges"],
};

interface AenderungRow {
  key: number;
  aenderung: string;
  alt: string;
  neu: string;
}

interface ArbeitsprotokollFormFieldsProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: Record<string, any>;
  fachobjektType?: string;
  readOnly?: boolean;
  onFormInstance?: (form: import("antd").FormInstance) => void;
  draftValues?: Record<string, unknown>;
  onValuesChange?: (
    changedValues: Record<string, unknown>,
    allValues: Record<string, unknown>,
  ) => void;
  onOriginalValues?: (values: Record<string, unknown>) => void;
}

const ArbeitsprotokollFormFields = ({
  data,
  fachobjektType,
  readOnly = true,
  onFormInstance,
  draftValues,
  onValuesChange,
  onOriginalValues,
}: ArbeitsprotokollFormFieldsProps) => {
  const [form] = Form.useForm();

  useEffect(() => {
    onFormInstance?.(form);
  }, [form, onFormInstance]);

  useEffect(() => {
    form.resetFields();
    if (data) {
      const serverValues = {
        monteur: data.monteur ?? "",
        datum: data.datum ? dayjs(data.datum) : null,
        status: data.arbeitsprotokollstatus?.bezeichnung ?? "",
        material: data.material ?? "",
        bemerkung: data.bemerkung ?? "",
      };
      form.setFieldsValue(serverValues);
      onOriginalValues?.(form.getFieldsValue());
      if (draftValues) {
        form.setFieldsValue(draftValues);
      }
    }
  }, [data, form, draftValues, onOriginalValues]);
  const aktionen = fachobjektType
    ? AKTIONEN_BY_FACHOBJEKT_TYPE[fachobjektType] ?? []
    : [];

  const aenderungRows: AenderungRow[] = useMemo(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const arr: Record<string, any>[] = data?.arbeitsprotokollaktionArray ?? [];
    return arr.map((entry, idx) => ({
      key: idx,
      aenderung: entry.aenderung ?? "",
      alt: entry.alt ?? "",
      neu: entry.neu ?? "",
    }));
  }, [data]);

  const aenderungColumns: ColumnsType<AenderungRow> = [
    {
      title: "Änderung",
      dataIndex: "aenderung",
      key: "aenderung",
      ellipsis: true,
    },
    {
      title: "von",
      dataIndex: "alt",
      key: "alt",
      width: 150,
      ellipsis: true,
    },
    {
      title: "zu",
      dataIndex: "neu",
      key: "neu",
      width: 150,
      ellipsis: true,
    },
  ];

  return (
    <div className="flex flex-col gap-4 pt-2">
      {/* Section A: Basic fields */}
      <Form
        form={form}
        layout="vertical"
        requiredMark={false}
        className={getFormClassName(readOnly)}
        onValuesChange={onValuesChange}
      >
        <Row gutter={16}>
          <Col span={12}>
            <FormItem name="monteur" label={<FormLabel>Monteur</FormLabel>} className="mb-4">
              <Input size="large" />
            </FormItem>
          </Col>
          <Col span={12}>
            <FormItem name="datum" label={<FormLabel>Datum</FormLabel>} className="mb-4">
              <DatePicker size="large" format="DD.MM.YYYY" style={{ width: "100%" }} />
            </FormItem>
          </Col>
        </Row>
        <Row gutter={16}>
          <Col span={12}>
            <FormItem name="status" label={<FormLabel>Status</FormLabel>} className="mb-4">
              <Input size="large" />
            </FormItem>
          </Col>
          <Col span={12}>
            <FormItem name="material" label={<FormLabel>Material</FormLabel>} className="mb-4">
              <Input size="large" />
            </FormItem>
          </Col>
        </Row>
        <FormItem name="bemerkung" label={<FormLabel>Bemerkung</FormLabel>} className="mb-4">
          <Input.TextArea
            size="large"
            autoSize={{ minRows: 2, maxRows: 6 }}
          />
        </FormItem>
      </Form>

      {/* Section B: Aktionen */}
      {aktionen.length > 0 && (
        <div>
          <div className="text-sm font-medium text-gray-700 mb-2">Aktionen</div>
          <div className="flex flex-wrap gap-1">
            {aktionen.map((aktion) => (
              <Tag key={aktion}>{aktion}</Tag>
            ))}
          </div>
        </div>
      )}

      {/* Section C: Änderung table */}
      <div>
        <div className="text-sm font-medium text-gray-700 mb-2">
          Änderungen ({aenderungRows.length})
        </div>
        {aenderungRows.length > 0 ? (
          <Table<AenderungRow>
            columns={aenderungColumns}
            dataSource={aenderungRows}
            size="small"
            pagination={false}
            scroll={{ y: 300 }}
          />
        ) : (
          <div className="text-sm text-gray-400 italic">
            Keine Änderungen vorhanden
          </div>
        )}
      </div>
    </div>
  );
};

export default ArbeitsprotokollFormFields;
