import { useMemo } from "react";
import { Form, Input, Row, Col, Table, Tag } from "antd";
import type { ColumnsType } from "antd/es/table";
import { getFormClassName } from "./readOnlyFormUtils";

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

function formatDate(isoDate: string): string {
  if (!isoDate) return "";
  try {
    return new Date(isoDate).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
  } catch {
    return isoDate;
  }
}

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
}

const ArbeitsprotokollFormFields = ({
  data,
  fachobjektType,
}: ArbeitsprotokollFormFieldsProps) => {
  const aktionen = fachobjektType
    ? AKTIONEN_BY_FACHOBJEKT_TYPE[fachobjektType] ?? []
    : [];

  const aenderungRows: AenderungRow[] = useMemo(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const arr: Record<string, any>[] =
      data?.arbeitsprotokollaktionArray ?? [];
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
        layout="vertical"
        requiredMark={false}
        className={getFormClassName(true)}
      >
        <Row gutter={16}>
          <Col span={12}>
            <Form.Item
              label={<FormLabel>Monteur</FormLabel>}
              className="mb-4"
            >
              <Input value={data.monteur ?? ""} size="large" readOnly />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item
              label={<FormLabel>Datum</FormLabel>}
              className="mb-4"
            >
              <Input
                value={formatDate(data.datum ?? "")}
                size="large"
                readOnly
              />
            </Form.Item>
          </Col>
        </Row>
        <Row gutter={16}>
          <Col span={12}>
            <Form.Item
              label={<FormLabel>Status</FormLabel>}
              className="mb-4"
            >
              <Input
                value={data.arbeitsprotokollstatus?.bezeichnung ?? ""}
                size="large"
                readOnly
              />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item
              label={<FormLabel>Material</FormLabel>}
              className="mb-4"
            >
              <Input value={data.material ?? ""} size="large" readOnly />
            </Form.Item>
          </Col>
        </Row>
        <Form.Item
          label={<FormLabel>Bemerkung</FormLabel>}
          className="mb-4"
        >
          <Input.TextArea
            value={data.bemerkung ?? ""}
            size="large"
            readOnly
            autoSize={{ minRows: 2, maxRows: 6 }}
          />
        </Form.Item>
      </Form>

      {/* Section B: Aktionen */}
      {aktionen.length > 0 && (
        <div>
          <div className="text-sm font-medium text-gray-700 mb-2">
            Aktionen
          </div>
          <div className="flex flex-wrap gap-1">
            {aktionen.map((aktion) => (
              <Tag key={aktion}>{aktion}</Tag>
            ))}
          </div>
        </div>
      )}

      {/* Section C: Änderung table */}
      {aenderungRows.length > 0 && (
        <div>
          <div className="text-sm font-medium text-gray-700 mb-2">
            Änderungen ({aenderungRows.length})
          </div>
          <Table<AenderungRow>
            columns={aenderungColumns}
            dataSource={aenderungRows}
            size="small"
            pagination={false}
            scroll={{ y: 300 }}
          />
        </div>
      )}
    </div>
  );
};

export default ArbeitsprotokollFormFields;
