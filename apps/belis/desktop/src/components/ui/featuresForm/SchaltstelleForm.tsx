import { useState, useEffect, useCallback } from "react";
import {
  Form,
  Row,
  Col,
  Select,
  Input,
  DatePicker,
  InputNumber,
  message,
} from "antd";
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

interface SchaltstelleFormProps {
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

interface BauartItem {
  id: number;
  bezeichnung?: string;
}

interface RundsteuerempfaengerItem {
  id: number;
  rs_typ?: string;
}

const FormLabel = ({ children }: { children: React.ReactNode }) => (
  <span className="text-sm font-medium text-gray-700">{children}</span>
);

const SchaltstelleForm = ({
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
}: SchaltstelleFormProps) => {
  const removedDocumentKeys = removedDocumentKeysProp ?? new Set<string>();
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);
  const [localDocuments, setLocalDocuments] = useState<DokumentItem[] | null>(
    null
  );
  const keyTablesData = useSelector(getKeyTablesData);
  const jwt = useSelector(getJWT);

  // Key table options - sorted alphabetically
  const bauartOptions = [
    ...((keyTablesData.bauart || []) as BauartItem[]),
  ].sort((a, b) => (a.bezeichnung || "").localeCompare(b.bezeichnung || ""));
  const rundsteuerempfaengerOptions = [
    ...((keyTablesData["rundsteuerempfänger"] ||
      []) as RundsteuerempfaengerItem[]),
  ].sort((a, b) => (a.rs_typ || "").localeCompare(b.rs_typ || ""));

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

  // Extract documents from schaltstelle[0].dokumenteArray
  const schaltstelleData = data as Record<string, unknown>;
  const schaltstelleArray = schaltstelleData?.schaltstelle as
    | Array<Record<string, unknown>>
    | undefined;
  const serverDocuments: DokumentItem[] =
    (schaltstelleArray?.[0]?.dokumenteArray as DokumentItem[]) || [];
  const documents = localDocuments ?? serverDocuments;

  // Extract schaltstelle object and ID
  const ss = schaltstelleArray?.[0] || null;
  const schaltstelleId = ss?.id as number | undefined;

  // Extract subtitle - use rawFeature (vector tile) to match list display
  const rawProps = rawFeature?.properties;
  const subtitle =
    (rawProps?.bauart_bezeichnung as string) ||
    (rawProps?.bezeichnung as string) ||
    "-ohne Bezeichnung-";

  // Compute sidebar main title to display in form header
  const sidebarMain = rawProps?.schaltstellen_nummer
    ? `S ${rawProps.schaltstellen_nummer}`
    : rawFeature?.id || rawProps?.id
    ? `S ${rawFeature?.id || rawProps?.id}`
    : "";

  useEffect(() => {
    // Reset form when data changes to clear old values
    form.resetFields();

    if (data) {
      const schaltstelleData = data as Record<string, unknown>;
      const { schaltstelle } = schaltstelleData;
      if (
        !schaltstelle ||
        !Array.isArray(schaltstelle) ||
        schaltstelle.length === 0
      ) {
        return;
      }
      const ss = schaltstelle[0];
      const serverValues = {
        // Strassenschluessel
        strassenschluessel_pk: ss.tkey_strassenschluessel?.pk,
        strassenschluessel_strasse: toTitleCase(
          ss.tkey_strassenschluessel?.strasse || ""
        ),
        // Hausnummer
        haus_nummer: ss.haus_nummer,
        // Standortbez.
        zusaetzliche_standortbezeichnung: ss.zusaetzliche_standortbezeichnung,
        // Laufende Nr.
        laufende_nummer: ss.laufende_nummer,
        // Schaltstellen Nr.
        schaltstellen_nummer: ss.schaltstellen_nummer,
        // Bauart - use id for Select value
        fk_bauart: ss.bauart?.id ?? null,
        // Erstellungsjahr - parse as date string
        erstellungsjahr: ss.erstellungsjahr
          ? dayjs(ss.erstellungsjahr as string)
          : null,
        // Rundsteuerempfaenger - use id for Select value
        rundsteuerempfaenger: ss.rundsteuerempfaengerObject?.id ?? null,
        // Einbaudatum
        einbaudatum_rs: ss.einbaudatum_rs
          ? dayjs(ss.einbaudatum_rs as string)
          : null,
        // Pruefung
        pruefdatum: ss.pruefdatum ? dayjs(ss.pruefdatum as string) : null,
        // Bemerkung
        bemerkung: ss.bemerkung,
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

    if (!schaltstelleId) {
      message.error("Keine Schaltstellen-ID gefunden");
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
        id: schaltstelleId,
        ...rest,
        // Include updated documents array when changed
        ...(finalDokumenteArray !== undefined
          ? { dokumenteArray: finalDokumenteArray }
          : {}),
      });

      console.log(
        "xxx saving schaltstelle:",
        JSON.stringify(dataToSave, null, 2)
      );
      await updateDataByClassName(jwt, "schaltstelle", dataToSave);

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
      message.success("Schaltstelle gespeichert");
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
      title={sidebarMain ? `Schaltstelle ${sidebarMain}` : "Schaltstelle"}
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
        <StrassenschluesselFields label="Strassenschlussel" />

        {/* Hausnummer */}
        <FormItem
          name="haus_nummer"
          label={<FormLabel>Hausnummer</FormLabel>}
          className="mb-4"
        >
          <Input size="large" />
        </FormItem>

        {/* Standortbez. */}
        <FormItem
          name="zusaetzliche_standortbezeichnung"
          label={<FormLabel>Standortbez.</FormLabel>}
          className="mb-4"
        >
          <Input size="large" />
        </FormItem>

        {/* Laufende Nr. and Schaltstellen Nr. */}
        <Row gutter={16}>
          <Col span={12}>
            <FormItem
              name="laufende_nummer"
              label={<FormLabel>Laufende Nr.</FormLabel>}
              className="mb-4"
            >
              <InputNumber className="w-full" size="large" />
            </FormItem>
          </Col>
          <Col span={12}>
            <FormItem
              name="schaltstellen_nummer"
              label={<FormLabel>Schaltstellen Nr.</FormLabel>}
              className="mb-4"
            >
              <Input size="large" />
            </FormItem>
          </Col>
        </Row>

        {/* Bauart */}
        <FormItem
          name="fk_bauart"
          label={<FormLabel>Bauart</FormLabel>}
          className="mb-4"
        >
          <Select
            placeholder={getPlaceholder(readOnly, "Bauart auswählen")}
            className="w-full"
            size="large"
            allowClear
            showSearch
            optionFilterProp="children"
          >
            {bauartOptions.map((item) => (
              <Select.Option key={item.id} value={item.id}>
                {item.bezeichnung}
              </Select.Option>
            ))}
          </Select>
        </FormItem>

        {/* Erstellungsjahr */}
        <FormItem
          name="erstellungsjahr"
          label={<FormLabel>Erstellungsjahr</FormLabel>}
          className="mb-4"
        >
          <DatePicker
            className="w-full"
            size="large"
            format="DD.MM.YYYY"
            placeholder={getPlaceholder(readOnly, "Datum auswählen")}
          />
        </FormItem>

        {/* Rundsteuerempfaenger */}
        <FormItem
          name="rundsteuerempfaenger"
          label={<FormLabel>Rundsteuerempf.</FormLabel>}
          className="mb-4"
        >
          <Select
            placeholder={getPlaceholder(
              readOnly,
              "Rundsteuerempfänger auswählen"
            )}
            className="w-full"
            size="large"
            allowClear
            showSearch
            optionFilterProp="children"
          >
            {rundsteuerempfaengerOptions.map((item) => (
              <Select.Option key={item.id} value={item.id}>
                {item.rs_typ}
              </Select.Option>
            ))}
          </Select>
        </FormItem>

        {/* Einbaudatum and Pruefung */}
        <Row gutter={16}>
          <Col span={12}>
            <FormItem
              name="einbaudatum_rs"
              label={<FormLabel>Einbaudatum</FormLabel>}
              className="mb-4"
            >
              <DatePicker
                className="w-full"
                size="large"
                format="DD.MM.YYYY"
                placeholder={getPlaceholder(readOnly, "Datum auswählen")}
              />
            </FormItem>
          </Col>
          <Col span={12}>
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
          </Col>
        </Row>

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

export default SchaltstelleForm;
