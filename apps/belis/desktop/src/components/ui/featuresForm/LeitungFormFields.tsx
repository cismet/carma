import { useEffect, useRef } from "react";
import { Form, Row, Col, Select } from "antd";
import type { FormInstance } from "antd";
import { useSelector } from "react-redux";
import { getKeyTablesData } from "../../../store/slices/keyTables";
import { getFormClassName, getPlaceholder } from "./readOnlyFormUtils";
import { FormItem } from "./DraftFieldHighlight";

interface LeitungFormFieldsProps {
  leitung: Record<string, unknown> | null;
  readOnly?: boolean;
  featureId?: string;
  form?: FormInstance;
  onFormInstance?: (form: FormInstance) => void;
  draftValues?: Record<string, unknown>;
  onValuesChange?: (
    changedValues: Record<string, unknown>,
    allValues: Record<string, unknown>
  ) => void;
  onOriginalValues?: (values: Record<string, unknown>) => void;
}

interface KeyTableItem {
  id: number;
  bezeichnung?: string;
  groesse?: string;
}

const FormLabel = ({ children }: { children: React.ReactNode }) => (
  <span className="text-sm font-medium text-gray-700">{children}</span>
);

const LeitungFormFields = ({
  leitung,
  readOnly = true,
  featureId,
  form: externalForm,
  onFormInstance,
  draftValues,
  onValuesChange,
  onOriginalValues,
}: LeitungFormFieldsProps) => {
  const [localForm] = Form.useForm();
  const form = externalForm ?? localForm;
  const draftApplied = useRef(false);
  const appliedForFeatureRef = useRef<string | number | undefined>(undefined);
  useEffect(() => {
    if (!externalForm) onFormInstance?.(form);
  }, [form, onFormInstance, externalForm]);

  const keyTablesData = useSelector(getKeyTablesData);

  const leitungstypOptions = [
    ...((keyTablesData.leitungstyp || []) as KeyTableItem[]),
  ].sort((a, b) => (a.bezeichnung || "").localeCompare(b.bezeichnung || ""));
  const materialOptions = [
    ...((keyTablesData.materialLeitung || []) as KeyTableItem[]),
  ].sort((a, b) => (a.bezeichnung || "").localeCompare(b.bezeichnung || ""));
  const querschnittOptions = (
    (keyTablesData.querschnitt || []) as KeyTableItem[]
  )
    .filter((item) => item.groesse !== null && item.groesse !== undefined)
    .sort((a, b) => Number(a.groesse) - Number(b.groesse));

  useEffect(() => {
    if (externalForm) return;
    if (!leitung) return;

    const featureChanged = appliedForFeatureRef.current !== featureId;
    const isCreationFeature = String(featureId ?? "").startsWith("create:");

    // During creation, the synthetic record gets a fresh reference per
    // keystroke. Re-running with the same featureId would call resetFields()
    // and steal focus. Bail unless this is the first arrival for this draft.
    if (!featureChanged && isCreationFeature) return;

    if (featureChanged) {
      // First time we see this feature — clear any stale state. For post-save
      // refresh on the same feature, skip resetFields so AntD keeps the DOM
      // intact (preserves scroll position and focus).
      form.resetFields();
      draftApplied.current = false;
    }

    const serverValues = {
      fk_leitungstyp: leitung.fk_leitungstyp,
      fk_material: leitung.fk_material,
      fk_querschnitt: leitung.fk_querschnitt,
    };
    form.setFieldsValue(serverValues);
    onOriginalValues?.(form.getFieldsValue());

    if (draftValues) {
      form.setFieldsValue(draftValues);
      draftApplied.current = true;
    }

    appliedForFeatureRef.current = featureId;
    // Depend on the `leitung` reference so post-save refetches re-populate
    // automatically; the featureChanged/isCreationFeature guards above filter
    // out the synthetic-record churn during creation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [featureId, leitung, form]);

  useEffect(() => {
    if (externalForm) return;
    if (draftApplied.current || !draftValues) return;
    form.setFieldsValue(draftValues);
    draftApplied.current = true;
  }, [draftValues, form, externalForm]);

  return (
    <Form
      form={form}
      layout="vertical"
      requiredMark={false}
      className={getFormClassName(readOnly, "pr-2")}
      onValuesChange={onValuesChange}
    >
      {/* Leitungstyp - Full Width */}
      <FormItem
        name="fk_leitungstyp"
        label={<FormLabel>Leitungstyp</FormLabel>}
        className="mb-4"
      >
        <Select
          placeholder={getPlaceholder(readOnly, "Leitungstyp auswählen")}
          className="w-full"
          size="large"
          showSearch
          allowClear
          optionFilterProp="children"
        >
          {leitungstypOptions.map((item) => (
            <Select.Option key={item.id} value={item.id}>
              {item.bezeichnung}
            </Select.Option>
          ))}
        </Select>
      </FormItem>

      {/* Material and Querschnitt - Side by Side */}
      <Row gutter={16}>
        <Col span={12}>
          <FormItem
            name="fk_material"
            label={<FormLabel>Material</FormLabel>}
            className="mb-4"
          >
            <Select
              placeholder={getPlaceholder(readOnly, "Material auswählen")}
              className="w-full"
              size="large"
              showSearch
              allowClear
              optionFilterProp="children"
            >
              {materialOptions.map((item) => (
                <Select.Option key={item.id} value={item.id}>
                  {item.bezeichnung}
                </Select.Option>
              ))}
            </Select>
          </FormItem>
        </Col>
        <Col span={12}>
          <FormItem
            name="fk_querschnitt"
            label={<FormLabel>Querschnitt</FormLabel>}
            className="mb-4"
          >
            <Select
              placeholder={getPlaceholder(readOnly, "Querschnitt auswählen")}
              className="w-full"
              size="large"
              showSearch
              allowClear
              optionFilterProp="children"
            >
              {querschnittOptions.map((item) => (
                <Select.Option key={item.id} value={item.id}>
                  {item.groesse}
                </Select.Option>
              ))}
            </Select>
          </FormItem>
        </Col>
      </Row>
    </Form>
  );
};

export default LeitungFormFields;
