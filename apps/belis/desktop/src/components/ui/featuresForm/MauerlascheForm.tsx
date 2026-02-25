import { useEffect, useState } from "react";
import { Form, Select, Input, DatePicker, InputNumber } from "antd";
import type { UploadFile } from "antd";
import { useSelector } from "react-redux";
import { getKeyTablesData } from "../../../store/slices/keyTables";
import { getJWT } from "../../../store/slices/auth";
import { DokumentItem } from "../DocumentPreview";
import FeatureFormLayout from "./FeatureFormLayout";
import StrassenschluesselFields from "./StrassenschluesselFields";
import { getFormClassName, getPlaceholder } from "./readOnlyFormUtils";
import dayjs from "dayjs";

interface MauerlascheFormProps {
  data: Record<string, unknown> | null;
  rawFeature?: { properties?: Record<string, unknown> } | null;
  onClose?: () => void;
  readOnly?: boolean;
  loading?: boolean;
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
}: MauerlascheFormProps) => {
  const [form] = Form.useForm();
  const [pendingFiles, setPendingFiles] = useState<UploadFile[]>([]);
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
    strassenschluessel?.strasse ||
    (rawProps?.strasse as string) ||
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
      form.setFieldsValue({
        // Strassenschluessel
        strassenschluessel_pk: ml.tkey_strassenschluessel?.pk,
        strassenschluessel_strasse: ml.tkey_strassenschluessel?.strasse,
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
      });
    }
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
      pendingFiles={pendingFiles}
      onFilesChange={setPendingFiles}
      debugData={data}
      loading={loading}
    >
      <Form
        form={form}
        layout="vertical"
        requiredMark={false}
        className={getFormClassName(readOnly, "pr-2")}
      >
        {/* Strassenschluessel - always disabled */}
        <StrassenschluesselFields label="Strassenschlussel" />

        {/* Laufende Nr. */}
        <Form.Item
          name="laufende_nummer"
          label={<FormLabel>Laufende Nr.</FormLabel>}
          className="mb-4"
        >
          <InputNumber className="w-full" size="large" />
        </Form.Item>

        {/* Montage (Erstellungsjahr) */}
        <Form.Item
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
        </Form.Item>

        {/* Material */}
        <Form.Item
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
        </Form.Item>

        {/* Pruefung */}
        <Form.Item
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
        </Form.Item>

        {/* Bemerkung */}
        <Form.Item
          name="bemerkung"
          label={<FormLabel>Bemerkung</FormLabel>}
          className="mb-4"
        >
          <Input.TextArea rows={4} size="large" />
        </Form.Item>
      </Form>
    </FeatureFormLayout>
  );
};

export default MauerlascheForm;
