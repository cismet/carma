import { Form, Row, Col, Select } from "antd";
import { useSelector } from "react-redux";
import { getKeyTablesData } from "../../../store/slices/keyTables";
import { FormItem } from "./DraftFieldHighlight";
import toTitleCase from "../../../helper/toTitleCase";

interface StrassenschluesselFieldsModalProps {
  namePrefix?: string;
  label?: string;
  isCreation?: boolean;
}

interface StrassenschluesselItem {
  id: number;
  pk: string;
  strasse: string;
}

const FormLabel = ({ children }: { children: React.ReactNode }) => (
  <span className="text-sm font-medium text-gray-700">{children}</span>
);

const StrassenschluesselFieldsModal = ({
  namePrefix,
  label = "Strassenschlüssel",
  isCreation,
}: StrassenschluesselFieldsModalProps) => {
  const form = Form.useFormInstance();
  const keyTablesData = useSelector(getKeyTablesData);

  const strassenschluesselOptions = [
    ...((keyTablesData["straßenschlüssel"] ||
      []) as StrassenschluesselItem[]),
  ]
    .filter((item) => item.pk && item.strasse)
    .sort((a, b) => a.pk.localeCompare(b.pk));

  const fieldName = (name: string) => (namePrefix ? [namePrefix, name] : name);

  const strasseName = fieldName("strassenschluessel_strasse");
  const pkName = fieldName("strassenschluessel_pk");

  const fkName = fieldName("fk_strassenschluessel");

  const handlePkChange = (selectedPk: string | undefined) => {
    const match = strassenschluesselOptions.find(
      (item) => item.pk === selectedPk
    );
    setTimeout(() => {
      form.setFieldValue(strasseName, match?.strasse ?? undefined);
      form.setFieldValue(fkName, match?.id ?? undefined);
    }, 0);
  };

  const handleStrasseChange = (selectedStrasse: string | undefined) => {
    const match = strassenschluesselOptions.find(
      (item) => item.strasse === selectedStrasse
    );
    setTimeout(() => {
      form.setFieldValue(pkName, match?.pk ?? undefined);
      form.setFieldValue(fkName, match?.id ?? undefined);
    }, 0);
  };

  return (
    <Row gutter={16}>
      <FormItem name={fieldName("fk_strassenschluessel")} hidden noStyle>
        <input type="hidden" />
      </FormItem>
      <Col span={6}>
        <FormItem
          name={fieldName("strassenschluessel_pk")}
          label={<FormLabel>{label}</FormLabel>}
          className={isCreation ? "mb-4 draft-changed-field" : "mb-4"}
        >
          <Select
            size="large"
            showSearch
            allowClear
            optionFilterProp="children"
            placeholder=""
            onChange={handlePkChange}
          >
            {strassenschluesselOptions.map((item) => (
              <Select.Option key={item.id} value={item.pk}>
                {item.pk}
              </Select.Option>
            ))}
          </Select>
        </FormItem>
      </Col>
      <Col span={18}>
        <FormItem
          name={fieldName("strassenschluessel_strasse")}
          label={<FormLabel>&nbsp;</FormLabel>}
          className={isCreation ? "mb-4 draft-changed-field" : "mb-4"}
        >
          <Select
            size="large"
            showSearch
            allowClear
            optionFilterProp="children"
            placeholder="Strasse auswählen"
            onChange={handleStrasseChange}
          >
            {strassenschluesselOptions.map((item) => (
              <Select.Option key={item.id} value={item.strasse}>
                {toTitleCase(item.strasse)}
              </Select.Option>
            ))}
          </Select>
        </FormItem>
      </Col>
    </Row>
  );
};

export default StrassenschluesselFieldsModal;
