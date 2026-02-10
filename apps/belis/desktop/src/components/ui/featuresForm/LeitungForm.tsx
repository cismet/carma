import { useEffect } from "react";
import { Form, Row, Col, Select } from "antd";
import { useSelector } from "react-redux";
import { getKeyTablesData } from "../../../store/slices/keyTables";

interface LeitungFormProps {
  data: Record<string, unknown> | null;
}

interface KeyTableItem {
  id: number;
  bezeichnung?: string;
  groesse?: string;
}

const LeitungForm = ({ data }: LeitungFormProps) => {
  const [form] = Form.useForm();
  const keyTablesData = useSelector(getKeyTablesData);

  const leitungstypOptions = (keyTablesData.leitungstyp || []) as KeyTableItem[];
  const materialOptions = (keyTablesData.materialLeitung || []) as KeyTableItem[];
  const querschnittOptions = (keyTablesData.querschnitt || []) as KeyTableItem[];

  useEffect(() => {
    if (data) {
      const leitungData = data.leitung?.[0] as Record<string, unknown> | undefined;
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
    return <div>Keine Daten ausgewählt</div>;
  }

  return (
    <Form form={form} layout="vertical" style={{ padding: "8px 0" }}>
      <Row gutter={24}>
        <Col span={12}>
          <Form.Item
            name="fk_leitungstyp"
            label={
              <span style={{ fontSize: 14, fontWeight: 400, color: "#8c8c8c" }}>
                Leitungstyp
              </span>
            }
            style={{ marginBottom: 16 }}
          >
            <Select>
              {leitungstypOptions.map((item) => (
                <Select.Option key={item.id} value={item.id}>
                  {item.bezeichnung}
                </Select.Option>
              ))}
            </Select>
          </Form.Item>
        </Col>
      </Row>

      <Row gutter={24}>
        <Col span={12}>
          <Form.Item
            name="fk_material"
            label={
              <span style={{ fontSize: 14, fontWeight: 400, color: "#8c8c8c" }}>
                Material
              </span>
            }
            style={{ marginBottom: 16 }}
          >
            <Select>
              {materialOptions.map((item) => (
                <Select.Option key={item.id} value={item.id}>
                  {item.bezeichnung}
                </Select.Option>
              ))}
            </Select>
          </Form.Item>
        </Col>
      </Row>

      <Row gutter={24}>
        <Col span={12}>
          <Form.Item
            name="fk_querschnitt"
            label={
              <span style={{ fontSize: 14, fontWeight: 400, color: "#8c8c8c" }}>
                Querschnitt
              </span>
            }
            style={{ marginBottom: 16 }}
          >
            <Select>
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
  );
};

export default LeitungForm;
