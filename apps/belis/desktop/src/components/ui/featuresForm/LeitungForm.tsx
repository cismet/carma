import { useEffect, useState } from "react";
import { Form, Row, Col, Select, Button, Tabs } from "antd";
import type { UploadFile } from "antd";
import { useSelector } from "react-redux";
import { CloseOutlined, EditOutlined } from "@ant-design/icons";
import { getKeyTablesData } from "../../../store/slices/keyTables";
import { getJWT } from "../../../store/slices/auth";
import DocumentPreview, { DokumentItem } from "../DocumentPreview";

interface LeitungFormProps {
  data: Record<string, unknown> | null;
  onClose?: () => void;
}

interface KeyTableItem {
  id: number;
  bezeichnung?: string;
  groesse?: string;
}

const LeitungForm = ({ data, onClose }: LeitungFormProps) => {
  const [form] = Form.useForm();
  const [pendingFiles, setPendingFiles] = useState<UploadFile[]>([]);
  const keyTablesData = useSelector(getKeyTablesData);
  const jwt = useSelector(getJWT);

  const leitungstypOptions = (keyTablesData.leitungstyp ||
    []) as KeyTableItem[];
  const materialOptions = (keyTablesData.materialLeitung ||
    []) as KeyTableItem[];
  const querschnittOptions = (keyTablesData.querschnitt ||
    []) as KeyTableItem[];

  // Extract documents from data
  const documents: DokumentItem[] = (data?.dokumente as DokumentItem[]) || [];

  useEffect(() => {
    if (data) {
      const leitungData = data.leitung?.[0] as
        | Record<string, unknown>
        | undefined;
      if (leitungData) {
        form.setFieldsValue({
          fk_leitungstyp: leitungData.fk_leitungstyp,
          fk_material: leitungData.fk_material,
          fk_querschnitt: leitungData.fk_querschnitt,
        });
      }
    }
  }, [data, form]);

  if (!data) {
    return (
      <div className="flex items-center justify-center h-40 text-gray-400">
        Keine Daten ausgewählt
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-gray-100 max-w-3xl w-full">
      {/* Header */}
      <div className="flex items-start justify-between p-6 pb-2">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
            <EditOutlined className="text-xl text-blue-600" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              Leitung bearbeiten
            </h2>
            <p className="text-sm text-gray-500">
              Füllen Sie die folgenden Informationen aus
            </p>
          </div>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors p-1"
          >
            <CloseOutlined className="text-lg" />
          </button>
        )}
      </div>

      {/* Tabbed Content */}
      <div className="px-6 py-4">
        <Tabs
          defaultActiveKey="general"
          items={[
            {
              key: "general",
              label: (
                <span className="flex items-center gap-2">
                  {/* <InfoOutlined /> */}
                  Allgemein
                </span>
              ),
              children: (
                <Form form={form} layout="vertical" requiredMark={false}>
                  {/* Leitungstyp - Full Width */}
                  <Form.Item
                    name="fk_leitungstyp"
                    label={
                      <span className="text-sm font-medium text-gray-700">
                        Leitungstyp
                      </span>
                    }
                    className="mb-5"
                  >
                    <Select
                      placeholder="Leitungstyp auswählen"
                      className="w-full"
                      size="large"
                    >
                      {leitungstypOptions.map((item) => (
                        <Select.Option key={item.id} value={item.id}>
                          {item.bezeichnung}
                        </Select.Option>
                      ))}
                    </Select>
                  </Form.Item>

                  {/* Material and Querschnitt - Side by Side */}
                  <Row gutter={16}>
                    <Col span={12}>
                      <Form.Item
                        name="fk_material"
                        label={
                          <span className="text-sm font-medium text-gray-700">
                            Material
                          </span>
                        }
                        className="mb-5"
                      >
                        <Select
                          placeholder="Material auswählen"
                          className="w-full"
                          size="large"
                        >
                          {materialOptions.map((item) => (
                            <Select.Option key={item.id} value={item.id}>
                              {item.bezeichnung}
                            </Select.Option>
                          ))}
                        </Select>
                      </Form.Item>
                    </Col>
                    <Col span={12}>
                      <Form.Item
                        name="fk_querschnitt"
                        label={
                          <span className="text-sm font-medium text-gray-700">
                            Querschnitt
                          </span>
                        }
                        className="mb-5"
                      >
                        <Select
                          placeholder="Querschnitt auswählen"
                          className="w-full"
                          size="large"
                        >
                          {querschnittOptions.map((item) => (
                            <Select.Option key={item.id} value={item.id}>
                              {item.groesse}
                            </Select.Option>
                          ))}
                        </Select>
                      </Form.Item>
                    </Col>
                  </Row>
                </Form>
              ),
            },
            {
              key: "documents",
              label: (
                <span className="flex items-center gap-2">
                  {/* <FileTextOutlined /> */}
                  Dokumente
                </span>
              ),
              children: (
                <DocumentPreview
                  documents={documents}
                  jwt={jwt}
                  onFilesChange={setPendingFiles}
                  pendingFiles={pendingFiles}
                />
              ),
            },
          ]}
        />
      </div>

      {/* Footer Buttons */}
      <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-100">
        <Button
          size="large"
          className="px-6 rounded-lg border-gray-200 text-gray-600 hover:text-gray-800 hover:border-gray-300"
        >
          Abbrechen
        </Button>
        <Button
          type="primary"
          size="large"
          className="px-6 rounded-lg bg-blue-600 hover:bg-blue-700"
        >
          Speichern
        </Button>
      </div>
    </div>
  );
};

export default LeitungForm;
