import { useEffect } from "react";
import { Form, Select, Input, DatePicker, InputNumber } from "antd";
import { useSelector } from "react-redux";
import type { DraftFile } from "../../../store/slices/featuresForms";
import { getKeyTablesData } from "../../../store/slices/keyTables";
import { getJWT } from "../../../store/slices/auth";
import { DokumentItem } from "../DocumentPreview";
import FeatureFormLayout from "./FeatureFormLayout";
import StrassenschluesselFields from "./StrassenschluesselFields";
import { getFormClassName, getPlaceholder } from "./readOnlyFormUtils";
import { FormItem } from "./DraftFieldHighlight";
import toTitleCase from "../../../helper/toTitleCase";
import dayjs from "dayjs";

interface MauerlascheFormProps {
  data: Record<string, unknown> | null;
  rawFeature?: { properties?: Record<string, unknown> } | null;
  onClose?: () => void;
  readOnly?: boolean;
  loading?: boolean;
  draftValues?: Record<string, unknown>;
  draftFiles?: DraftFile[];
  hasDraft?: boolean;
  onDraftChange?: (values: Record<string, unknown>) => void;
  onDraftFilesChange?: (files: DraftFile[]) => void;
  onOriginalValues?: (values: Record<string, unknown>) => void;
  onToggleReadOnly?: () => void;
  onCancel?: () => void;
  onSaveComplete?: () => void;
}

interface MaterialMauerlascheItem {
  id: number;
  bezeichnung?: string;
}

const MauerlascheForm = ({
  data,
  rawFeature,
  onClose,
  readOnly = true,
  loading,
  draftValues,
  draftFiles,
  hasDraft,
  onDraftChange,
  onDraftFilesChange,
  onOriginalValues,
  onToggleReadOnly,
  onCancel,
  onSaveComplete,
}: MauerlascheFormProps) => {
  const [form] = Form.useForm();

  const handleSave = () => {
    console.log("Mauerlasche form values:", form.getFieldsValue());
    onSaveComplete?.();
  };
  const keyTablesData = useSelector(getKeyTablesData);
  const jwt = useSelector(getJWT);

  // Key table options - sorted alphabetically
  const materialMauerlascheOptions = [
    ...((keyTablesData.materialMauerlasche || []) as MaterialMauerlascheItem[]),
  ].sort((a, b) => (a.bezeichnung || "").localeCompare(b.bezeichnung || ""));

  // Extract documents from mauerlasche[0].dokumenteArray
  const mauerlascheData = data as Record<string, unknown>;
  const mauerlascheArray = mauerlascheData?.mauerlasche as
    | Array<Record<string, unknown>>
    | undefined;
  const documents: DokumentItem[] =
    (mauerlascheArray?.[0]?.dokumenteArray as DokumentItem[]) || [];

  // Extract subtitle - use rawFeature (vector tile) to match list display
  const rawProps = rawFeature?.properties as
    | Record<string, unknown>
    | undefined;
  const strassenschluessel = rawProps?.fk_strassenschluessel as
    | { strasse?: string }
    | undefined;
  const subtitle =
    toTitleCase(strassenschluessel?.strasse || "") ||
    toTitleCase((rawProps?.strasse as string) || "") ||
    "-ohne Straße-";

  useEffect(() => {
    // Reset form when data changes to clear old values
    form.resetFields();

    if (data) {
      const mauerlascheData = data as Record<string, unknown>;
      const { mauerlasche } = mauerlascheData;
      if (
        !mauerlasche ||
        !Array.isArray(mauerlasche) ||
        mauerlasche.length === 0
      ) {
        return;
      }
      const ml = mauerlasche[0];
      const serverValues = {
        // Strassenschluessel
        strassenschluessel_pk: ml.tkey_strassenschluessel?.pk,
        strassenschluessel_strasse: toTitleCase(
          ml.tkey_strassenschluessel?.strasse || ""
        ),
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
  }, [data, form]);

  if (!data) {
    return (
      <div className="flex items-center justify-center h-40 text-gray-400">
        Keine Daten ausgewahlt
      </div>
    );
  }

  const FormLabel = ({ children }: { children: React.ReactNode }) => (
    <span className="text-sm font-medium text-gray-700">{children}</span>
  );

  return (
    <FeatureFormLayout
      title="Mauerlasche"
      subtitle={subtitle}
      documents={documents}
      jwt={jwt}
      draftFiles={draftFiles}
      onDraftFilesChange={onDraftFilesChange}
      debugData={data}
      loading={loading}
      readOnly={readOnly}
      hasDraft={hasDraft}
      onToggleReadOnly={onToggleReadOnly}
      onCancel={onCancel}
      onSave={handleSave}
    >
      <Form
        form={form}
        layout="vertical"
        requiredMark={false}
        className={getFormClassName(readOnly, "pr-2")}
        onValuesChange={(_, allValues) => onDraftChange?.(allValues)}
      >
        {/* Strassenschluessel - always disabled */}
        <StrassenschluesselFields label="Strassenschlussel" />

        {/* Laufende Nr. */}
        <FormItem
          name="laufende_nummer"
          label={<FormLabel>Laufende Nr.</FormLabel>}
          className="mb-4"
        >
          <InputNumber className="w-full" size="large" />
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
            placeholder={getPlaceholder(readOnly, "Datum auswahlen")}
          />
        </FormItem>

        {/* Material */}
        <FormItem
          name="fk_material"
          label={<FormLabel>Material</FormLabel>}
          className="mb-4"
        >
          <Select
            placeholder={getPlaceholder(readOnly, "Material auswahlen")}
            className="w-full"
            size="large"
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

        {/* Pruefung */}
        <FormItem
          name="pruefdatum"
          label={<FormLabel>Prufung</FormLabel>}
          className="mb-4"
        >
          <DatePicker
            className="w-full"
            size="large"
            format="DD.MM.YYYY"
            placeholder={getPlaceholder(readOnly, "Datum auswahlen")}
          />
        </FormItem>

        {/* Bemerkung */}
        <FormItem
          name="bemerkung"
          label={<FormLabel>Bemerkung</FormLabel>}
          className="mb-4"
        >
          <Input.TextArea rows={4} size="large" />
        </FormItem>
      </Form>
    </FeatureFormLayout>
  );
};

export default MauerlascheForm;
