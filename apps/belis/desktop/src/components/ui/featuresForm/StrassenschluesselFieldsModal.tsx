import { Form, Row, Col, Input } from "antd";
import { FormItem } from "./DraftFieldHighlight";

interface StrassenschluesselFieldsModalProps {
  /** Optional prefix for field names (e.g., for nested forms) */
  namePrefix?: string;
  /** Label text for the field group (default: "Strassenschlüssel") */
  label?: string;
}

const FormLabel = ({ children }: { children: React.ReactNode }) => (
  <span className="text-sm font-medium text-gray-700">{children}</span>
);

const StrassenschluesselFieldsModal = ({
  namePrefix,
  label = "Strassenschlüssel",
}: StrassenschluesselFieldsModalProps) => {
  const fieldName = (name: string) => (namePrefix ? [namePrefix, name] : name);

  return (
    <Row gutter={16}>
      <Col span={6}>
        <FormItem
          name={fieldName("strassenschluessel_pk")}
          label={<FormLabel>{label}</FormLabel>}
          className="mb-4"
        >
          <Input size="large" />
        </FormItem>
      </Col>
      <Col span={18}>
        <FormItem
          name={fieldName("strassenschluessel_strasse")}
          label={<FormLabel>&nbsp;</FormLabel>}
          className="mb-4"
        >
          <Input size="large" />
        </FormItem>
      </Col>
    </Row>
  );
};

export default StrassenschluesselFieldsModal;
