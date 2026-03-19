import { useState, useEffect, useCallback } from "react";
import { Form, Select, Input, DatePicker, InputNumber, message } from "antd";
import { useSelector } from "react-redux";
import dayjs from "dayjs";
import type { DraftFile } from "../../../store/slices/featuresForms";
import { getKeyTablesData } from "../../../store/slices/keyTables";
import { getJWT } from "../../../store/slices/auth";
import { DokumentItem } from "../DocumentPreview";
import { getDocumentKey } from "../FilePreview";
import FeatureFormLayout from "./FeatureFormLayout";
import StrassenschluesselFields from "./StrassenschluesselFields";
import { getFormClassName, getPlaceholder } from "./readOnlyFormUtils";
import { FormItem } from "./DraftFieldHighlight";
import toTitleCase from "../../../helper/toTitleCase";
import { updateDataByClassName } from "../../../helper/apiMethods";
import { uploadDraftFiles } from "../../../helper/uploadDraftFiles";

const transformDatesForBackend = (
  values: Record<string, unknown>
): Record<string, unknown> => {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(values)) {
    if (dayjs.isDayjs(value)) {
      result[key] = value.toISOString();
    } else {
      result[key] = value;
    }
  }
  return result;
};

interface MauerlascheFormProps {
  data: Record<string, unknown> | null;
  rawFeature?: {
    id?: string | number;
    properties?: Record<string, unknown>;
  } | null;
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
  removedDocumentKeys?: Set<string>;
  onRemovedDocumentKeysChange?: (keys: Set<string>) => void;
}

interface MaterialMauerlascheItem {
  id: number;
  bezeichnung?: string;
}

const FormLabel = ({ children }: { children: React.ReactNode }) => (
  <span className="text-sm font-medium text-gray-700">{children}</span>
);

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
  removedDocumentKeys: removedDocumentKeysProp,
  onRemovedDocumentKeysChange,
}: MauerlascheFormProps) => {
  const removedDocumentKeys = removedDocumentKeysProp ?? new Set<string>();
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const [localDocuments, setLocalDocuments] = useState<DokumentItem[] | null>(
    null
  );
  const keyTablesData = useSelector(getKeyTablesData);
  const jwt = useSelector(getJWT);

  // Key table options - sorted alphabetically
  const materialMauerlascheOptions = [
    ...((keyTablesData.materialMauerlasche || []) as MaterialMauerlascheItem[]),
  ].sort((a, b) => (a.bezeichnung || "").localeCompare(b.bezeichnung || ""));

  const handleToggleRemoveDocument = useCallback(
    (key: string) => {
      const next = new Set(removedDocumentKeys);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      onRemovedDocumentKeysChange?.(next);
    },
    [removedDocumentKeys, onRemovedDocumentKeysChange]
  );

  // Reset local documents override when data changes
  useEffect(() => {
    setLocalDocuments(null);
  }, [data]);

  // Extract documents from mauerlasche[0].dokumenteArray
  const mauerlascheData = data as Record<string, unknown>;
  const mauerlascheArray = mauerlascheData?.mauerlasche as
    | Array<Record<string, unknown>>
    | undefined;
  const serverDocuments: DokumentItem[] =
    (mauerlascheArray?.[0]?.dokumenteArray as DokumentItem[]) || [];
  const documents = localDocuments ?? serverDocuments;

  // Extract mauerlasche object and ID
  const ml = mauerlascheArray?.[0] || null;
  const mauerlascheId = ml?.id as number | undefined;

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

  // Compute sidebar main title to display in form header
  const sidebarMain =
    rawProps?.laufende_nummer || rawFeature?.id || rawProps?.id
      ? `M-${rawProps?.laufende_nummer || rawFeature?.id || rawProps?.id}`
      : "";

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

  const handleSave = async () => {
    if (!jwt) {
      message.error("Nicht authentifiziert");
      return;
    }

    if (!mauerlascheId) {
      message.error("Keine Mauerlaschen-ID gefunden");
      return;
    }

    setSaving(true);
    try {
      const formValues = form.getFieldsValue();

      // Remove display-only fields that the backend doesn't expect
      const { strassenschluessel_pk, strassenschluessel_strasse, ...rest } =
        formValues;

      // Upload pending draft files first
      let uploadedDocuments: DokumentItem[] = [];
      if (draftFiles && draftFiles.length > 0) {
        uploadedDocuments = await uploadDraftFiles(jwt, draftFiles);
      }

      // Build final dokumenteArray: existing minus removed, plus newly uploaded
      const hasDocumentChanges =
        uploadedDocuments.length > 0 || removedDocumentKeys.size > 0;
      let finalDokumenteArray: DokumentItem[] | undefined;
      if (hasDocumentChanges) {
        const kept = documents.filter(
          (doc) => !removedDocumentKeys.has(getDocumentKey(doc))
        );
        finalDokumenteArray = [...kept, ...uploadedDocuments];
      }

      const dataToSave = transformDatesForBackend({
        id: mauerlascheId,
        ...rest,
        // Include updated documents array when changed
        ...(finalDokumenteArray !== undefined
          ? { dokumenteArray: finalDokumenteArray }
          : {}),
      });

      console.log(
        "xxx saving mauerlasche:",
        JSON.stringify(dataToSave, null, 2)
      );
      await updateDataByClassName(jwt, "mauerlasche", dataToSave);

      // Update local documents so changes appear immediately
      if (hasDocumentChanges && finalDokumenteArray) {
        setLocalDocuments(finalDokumenteArray);
        onRemovedDocumentKeysChange?.(new Set());
      }

      if (removedDocumentKeys.size > 0) {
        message.success(
          removedDocumentKeys.size === 1
            ? "1 Datei gelöscht"
            : `${removedDocumentKeys.size} Dateien gelöscht`
        );
      }
      message.success("Mauerlasche gespeichert");
      onSaveComplete?.();
    } catch (error) {
      console.error("Save error:", error);
      message.error(
        error instanceof Error ? error.message : "Fehler beim Speichern"
      );
    } finally {
      setSaving(false);
    }
  };

  if (!data) {
    return (
      <div className="flex items-center justify-center h-40 text-gray-400">
        Keine Daten ausgewählt
      </div>
    );
  }

  return (
    <FeatureFormLayout
      title={sidebarMain ? `Mauerlasche ${sidebarMain}` : "Mauerlasche"}
      cancelLabel={sidebarMain || ""}
      subtitle={subtitle}
      documents={documents}
      jwt={jwt}
      draftFiles={draftFiles}
      onDraftFilesChange={onDraftFilesChange}
      removedDocumentKeys={removedDocumentKeys}
      onToggleRemoveDocument={handleToggleRemoveDocument}
      debugData={data}
      loading={loading}
      saving={saving}
      readOnly={readOnly}
      hasDraft={hasDraft || removedDocumentKeys.size > 0}
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
        <StrassenschluesselFields label="Strassenschlüssel" />

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
          <Input.TextArea rows={4} size="large" />
        </FormItem>
      </Form>
    </FeatureFormLayout>
  );
};

export default MauerlascheForm;
