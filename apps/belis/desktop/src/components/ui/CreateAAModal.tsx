import { useMemo } from "react";
import { Modal, Button, Form, Input, Row, Col, Select } from "antd";
import { useSelector } from "react-redux";
import dayjs from "dayjs";
import { getLogin } from "../../store/slices/auth";
import { getKeyTablesData } from "../../store/slices/keyTables";
import type { SidebarFeature } from "./BelisSidebar";

const FormLabel = ({ children }: { children: React.ReactNode }) => (
  <span className="text-sm font-medium text-gray-700">{children}</span>
);

interface CreateAAModalProps {
  open: boolean;
  onClose: () => void;
  highlights: SidebarFeature[];
}

const CreateAAModal = ({ open, onClose, highlights }: CreateAAModalProps) => {
  const [form] = Form.useForm();
  const login = useSelector(getLogin);
  const keyTablesData = useSelector(getKeyTablesData);

  const teamOptions = useMemo(() => {
    if (!keyTablesData?.teams) return [];
    return [...keyTablesData.teams]
      .sort((a: { name?: string }, b: { name?: string }) =>
        (a.name ?? "").localeCompare(b.name ?? "", "de")
      )
      .map((team: { id: number; name?: string }) => ({
        value: team.id,
        label: team.name || "",
      }));
  }, [keyTablesData]);

  const today = dayjs().format("DD.MM.YYYY");

  const handleSubmit = () => {
    const values = form.getFieldsValue();
    console.log({
      formData: {
        zugewiesen_an: values.zugewiesen_an ?? null,
        angelegt_von: login,
        angelegt_am: dayjs().format("YYYY-MM-DDTHH:mm:ss"),
      },
      highlights,
    });
    form.resetFields();
    onClose();
  };

  const handleCancel = () => {
    form.resetFields();
    onClose();
  };

  return (
    <Modal
      title="Neuen Arbeitsauftrag erstellen"
      open={open}
      onCancel={handleCancel}
      centered
      width={600}
      footer={
        <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
          <Button onClick={handleCancel}>Abbrechen</Button>
          <Button type="primary" onClick={handleSubmit}>
            Erstellen
          </Button>
        </div>
      }
      styles={{
        body: { paddingTop: 16 },
        header: { borderBottom: "1px solid #f3f4f6", paddingBottom: 16 },
      }}
    >
      <Form form={form} layout="vertical" requiredMark={false}>
        <Row gutter={16}>
          <Col span={12} className="cursor-not-allowed">
            <div className="pointer-events-none">
              <Form.Item
                label={<FormLabel>Auftragsnummer</FormLabel>}
                className="mb-4"
              >
                <Input
                  placeholder="Wird automatisch vergeben"
                  size="large"
                  readOnly
                />
              </Form.Item>
            </div>
          </Col>
          <Col span={12}>
            <Form.Item
              name="zugewiesen_an"
              label={<FormLabel>Zugewiesen an</FormLabel>}
              className="mb-4"
            >
              <Select
                size="large"
                placeholder="Team auswählen"
                options={teamOptions}
                showSearch
                filterOption={(input, option) =>
                  (option?.label ?? "")
                    .toLowerCase()
                    .includes(input.toLowerCase())
                }
                allowClear
              />
            </Form.Item>
          </Col>
        </Row>
        <Row gutter={16}>
          <Col span={12} className="cursor-not-allowed">
            <div className="pointer-events-none">
              <Form.Item
                label={<FormLabel>Angelegt von</FormLabel>}
                className="mb-4"
              >
                <Input value={login ?? ""} size="large" readOnly />
              </Form.Item>
            </div>
          </Col>
          <Col span={12} className="cursor-not-allowed">
            <div className="pointer-events-none">
              <Form.Item
                label={<FormLabel>Angelegt am</FormLabel>}
                className="mb-4"
              >
                <Input value={today} size="large" readOnly />
              </Form.Item>
            </div>
          </Col>
        </Row>
      </Form>
    </Modal>
  );
};

export default CreateAAModal;
