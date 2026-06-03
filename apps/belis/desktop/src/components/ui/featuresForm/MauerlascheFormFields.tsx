import { useEffect, useRef } from "react";
import { Form, Select, Input, DatePicker, InputNumber } from "antd";
import type { FormInstance } from "antd";
import { useSelector } from "react-redux";
import dayjs from "dayjs";
import { getKeyTablesData } from "../../../store/slices/keyTables";
import StrassenschluesselFields from "./StrassenschluesselFields";
import StrassenschluesselFieldsModal from "./StrassenschluesselFieldsModal";
import { getFormClassName, getPlaceholder } from "./readOnlyFormUtils";
import { FormItem } from "./DraftFieldHighlight";
import toTitleCase from "../../../helper/toTitleCase";

interface MauerlascheFormFieldsProps {
  mauerlasche: Record<string, unknown> | null;
  readOnly?: boolean;
  isCreation?: boolean;
  featureId?: string;
  geometrySelector?: React.ReactNode;
  form?: FormInstance;
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
  featureId,
  geometrySelector,
  form: externalForm,
  onFormInstance,
  draftValues,
  onValuesChange,
  onOriginalValues,
}: MauerlascheFormFieldsProps) => {
  const [localForm] = Form.useForm();
  const form = externalForm ?? localForm;
  const draftApplied = useRef(false);
  const appliedForFeatureRef = useRef<string | number | undefined>(undefined);
  useEffect(() => {
    if (!externalForm) onFormInstance?.(form);
  }, [form, onFormInstance, externalForm]);

  const keyTablesData = useSelector(getKeyTablesData);

  // Key table options - sorted alphabetically
  const materialMauerlascheOptions = [
    ...((keyTablesData.materialMauerlasche || []) as MaterialMauerlascheItem[]),
  ].sort((a, b) => (a.bezeichnung || "").localeCompare(b.bezeichnung || ""));

  useEffect(() => {
    if (externalForm) return;
    if (!mauerlasche) return;

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

    const ml = mauerlasche;
    const tkey = ml.tkey_strassenschluessel as
      | { pk?: string; strasse?: string }
      | undefined;
    const serverValues = {
      // Strassenschluessel
      strassenschluessel_pk: tkey?.pk,
      strassenschluessel_strasse: tkey?.strasse
        ? toTitleCase(tkey.strasse)
        : undefined,
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
      draftApplied.current = true;
    }

    appliedForFeatureRef.current = featureId;
    // Depend on the `mauerlasche` reference so post-save refetches re-populate
    // automatically; the featureChanged/isCreationFeature guards above filter
    // out the synthetic-record churn during creation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [featureId, mauerlasche, form]);

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
      {geometrySelector}

      {!readOnly ? (
        <StrassenschluesselFieldsModal
          label="Strassenschlüssel"
          onSyncDerivedValues={onValuesChange}
        />
      ) : (
        <StrassenschluesselFields label="Strassenschlüssel" />
      )}

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
