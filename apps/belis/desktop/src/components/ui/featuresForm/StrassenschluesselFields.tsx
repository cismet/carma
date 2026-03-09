import { Form, Row, Col, Input } from "antd";
import { FormItem } from "./DraftFieldHighlight";

interface StrassenschluesselFieldsProps {
  /** Optional prefix for field names (e.g., for nested forms) */
  namePrefix?: string;
  /** Label text for the field group (default: "Strassenschlüssel") */
  label?: string;
}

const FormLabel = ({ children }: { children: React.ReactNode }) => (
  <span className="text-sm font-medium text-gray-700">{children}</span>
);

/**
 * Reusable Strassenschluessel fields component.
 * Always non-editable since this is reference data that shouldn't be changed.
 * Uses pointer-events-none to keep normal visual appearance.
 */
const StrassenschluesselFields = ({
  namePrefix,
  label = "Strassenschlüssel",
}: StrassenschluesselFieldsProps) => {
  // Helper to create field name with optional prefix
  const fieldName = (name: string) => (namePrefix ? [namePrefix, name] : name);

  return (
    <div className="cursor-not-allowed">
      <Row gutter={16} className="pointer-events-none">
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
    </div>
  );
};

export default StrassenschluesselFields;
