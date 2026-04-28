import { useEffect } from "react";
import { Form, Select, Input, DatePicker, InputNumber } from "antd";
import type { FormInstance } from "antd";
import { useSelector } from "react-redux";
import dayjs from "dayjs";
import { getKeyTablesData } from "../../../store/slices/keyTables";
import StrassenschluesselFields from "./StrassenschluesselFields";
import { getFormClassName, getPlaceholder } from "./readOnlyFormUtils";
import { FormItem } from "./DraftFieldHighlight";
import toTitleCase from "../../../helper/toTitleCase";

interface MauerlascheFormFieldsProps {
  mauerlasche: Record<string, unknown> | null;
  readOnly?: boolean;
  onFormInstance?: (form: FormInstance) => void;
  draftValues?: Record<string, unknown>;
  onValuesChange?: (
    changedValues: Record<string, unknown>,
    allValues: Record<string, unknown>
  ) => void;
  onOriginalValues?: (values: Record<string, unknown>) => void;
}

interface MaterialMauerlascheItem {
  id: number;
  bezeichnung?: string;
}

const FormLabel = ({ children }: { children: React.ReactNode }) => (
  <span className="text-sm font-medium text-gray-700">{children}</span>
);

const MauerlascheFormFields = ({
  mauerlasche,
  readOnly = true,
  onFormInstance,
  draftValues,
  onValuesChange,
  onOriginalValues,
}: MauerlascheFormFieldsProps) => {
  const [form] = Form.useForm();
  useEffect(() => {
    onFormInstance?.(form);
  }, [form, onFormInstance]);

  const keyTablesData = useSelector(getKeyTablesData);

  // Key table options - sorted alphabetically
  const materialMauerlascheOptions = [
    ...((keyTablesData.materialMauerlasche || []) as MaterialMauerlascheItem[]),
  ].sort((a, b) => (a.bezeichnung || "").localeCompare(b.bezeichnung || ""));

  useEffect(() => {
    form.resetFields();

    if (mauerlasche) {
      const ml = mauerlasche;
      const tkey = ml.tkey_strassenschluessel as
        | { pk?: string; strasse?: string }
        | undefined;
      const serverValues = {
        // Strassenschluessel
        strassenschluessel_pk: tkey?.pk,
        strassenschluessel_strasse: toTitleCase(tkey?.strasse || ""),
        // Laufende Nr.
        laufende_nummer: ml.laufende_nummer,
        // Montage (Erstellungsjahr) - can be a date string or year number
        erstellungsjahr: ml.erstellungsjahr
          ? dayjs(ml.erstellungsjahr as string | number)
          : null,
        // Material - use id from material_mauerlasche object or fk_material
        fk_material:
          (ml.material_mauerlasche as { id?: number } | undefined)?.id ??
          ml.fk_material,
        // Pruefung
        pruefdatum: ml.pruefdatum ? dayjs(ml.pruefdatum as string) : null,
        // Bemerkung
        bemerkung: ml.bemerkung,
      };
      form.setFieldsValue(serverValues);
      onOriginalValues?.(form.getFieldsValue());

      if (draftValues) {
        form.setFieldsValue(draftValues);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mauerlasche, form]);

  return (
    <Form
      form={form}
      layout="vertical"
      requiredMark={false}
      className={getFormClassName(readOnly, "pr-2")}
      onValuesChange={onValuesChange}
    >
      {/* Strassenschluessel - always disabled */}
      <StrassenschluesselFields label="Strassenschlüssel" />

      {/* Laufende Nr. */}
      <FormItem
        name="laufende_nummer"
        label={<FormLabel>Laufende Nr.</FormLabel>}
        className="mb-4"
      >
        <InputNumber className="w-full" size="large" placeholder={getPlaceholder(readOnly, "Nummer eingeben")} />
      </FormItem>

      {/* Montage (Erstellungsjahr) */}
      <FormItem
        name="erstellungsjahr"
        label={<FormLabel>Montage</FormLabel>}
        className="mb-4"
      >
        <DatePicker
          className="w-full"
          size="large"
          format="DD.MM.YYYY"
          placeholder={getPlaceholder(readOnly, "Datum auswählen")}
        />
      </FormItem>

      {/* Material */}
      <FormItem
        name="fk_material"
        label={<FormLabel>Material</FormLabel>}
        className="mb-4"
      >
        <Select
          placeholder={getPlaceholder(readOnly, "Material auswählen")}
          className="w-full"
          size="large"
          allowClear
          showSearch
          optionFilterProp="children"
        >
          {materialMauerlascheOptions.map((item) => (
            <Select.Option key={item.id} value={item.id}>
              {item.bezeichnung}
            </Select.Option>
          ))}
        </Select>
      </FormItem>

      {/* Prüfung */}
      <FormItem
        name="pruefdatum"
        label={<FormLabel>Prüfung</FormLabel>}
        className="mb-4"
      >
        <DatePicker
          className="w-full"
          size="large"
          format="DD.MM.YYYY"
          placeholder={getPlaceholder(readOnly, "Datum auswählen")}
        />
      </FormItem>

      {/* Bemerkung */}
      <FormItem
        name="bemerkung"
        label={<FormLabel>Bemerkung</FormLabel>}
        className="mb-4"
      >
        <Input.TextArea rows={4} size="large" placeholder={getPlaceholder(readOnly, "Bemerkung eingeben")} />
      </FormItem>
    </Form>
  );
};

export default MauerlascheFormFields;
