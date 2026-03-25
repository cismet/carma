import { Input, Select, DatePicker, Checkbox, Row, Col, Form } from "antd";
import { useSelector } from "react-redux";
import { getKeyTablesData } from "../../../../store/slices/keyTables";
import { applyTemplate } from "./aktionFieldConfig";
import type { AktionFieldConfig } from "./aktionFieldConfig";

const FormLabel = ({ children }: { children: React.ReactNode }) => (
  <span className="text-sm font-medium text-gray-700">{children}</span>
);

interface AktionFieldRendererProps {
  field: AktionFieldConfig;
}

const AktionFieldRenderer = ({ field }: AktionFieldRendererProps) => {
  const keyTablesData = useSelector(getKeyTablesData);

  switch (field.type) {
    case "date-select": {
      if (field.keyTableName) {
        const options = (keyTablesData[field.keyTableName] ?? []) as Record<
          string,
          unknown
        >[];
        return (
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name={field.name}
                label={<FormLabel>{field.label}</FormLabel>}
                className="mb-4"
              >
                <DatePicker
                  className="w-full"
                  size="large"
                  format="DD.MM.YYYY"
                  placeholder="Datum auswählen"
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name={`${field.name}_select`}
                label={<FormLabel>&nbsp;</FormLabel>}
                className="mb-4"
              >
                <Select
                  placeholder="Auswählen"
                  className="w-full"
                  size="large"
                  allowClear
                  showSearch
                  optionFilterProp="children"
                >
                  {options.map((item) => (
                    <Select.Option
                      key={String(item.id)}
                      value={item.id as number}
                    >
                      {applyTemplate(field.optionTemplate ?? "", item)}
                    </Select.Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
          </Row>
        );
      }
      return (
        <Form.Item
          name={field.name}
          label={<FormLabel>{field.label}</FormLabel>}
          className="mb-4"
        >
          <DatePicker
            className="w-full"
            size="large"
            format="DD.MM.YYYY"
            placeholder="Datum auswählen"
          />
        </Form.Item>
      );
    }

    case "select": {
      const options = (keyTablesData[field.keyTableName] ?? []) as Record<
        string,
        unknown
      >[];
      return (
        <Form.Item
          name={field.name}
          label={<FormLabel>{field.label}</FormLabel>}
          className="mb-4"
        >
          <Select
            placeholder="Auswählen"
            className="w-full"
            size="large"
            allowClear
            showSearch
            optionFilterProp="children"
          >
            {options.map((item) => (
              <Select.Option
                key={String(item.id)}
                value={item.id as number}
              >
                {applyTemplate(field.optionTemplate, item)}
              </Select.Option>
            ))}
          </Select>
        </Form.Item>
      );
    }

    case "text":
      return (
        <Form.Item
          name={field.name}
          label={<FormLabel>{field.label}</FormLabel>}
          className="mb-4"
        >
          <Input size="large" />
        </Form.Item>
      );

    case "textarea":
      return (
        <Form.Item
          name={field.name}
          label={<FormLabel>{field.label}</FormLabel>}
          className="mb-4"
        >
          <Input.TextArea
            size="large"
            autoSize={{
              minRows: field.minRows ?? 3,
              maxRows: field.maxRows ?? 6,
            }}
          />
        </Form.Item>
      );

    case "checkbox":
      return (
        <Form.Item name={field.name} valuePropName="checked" className="mb-4">
          <Checkbox>{field.checkboxLabel ?? field.label}</Checkbox>
        </Form.Item>
      );

    case "date":
      return (
        <Form.Item
          name={field.name}
          label={<FormLabel>{field.label}</FormLabel>}
          className="mb-4"
        >
          <DatePicker
            className="w-full"
            size="large"
            format="DD.MM.YYYY"
            placeholder="Datum auswählen"
          />
        </Form.Item>
      );

    default:
      return null;
  }
};

export default AktionFieldRenderer;
