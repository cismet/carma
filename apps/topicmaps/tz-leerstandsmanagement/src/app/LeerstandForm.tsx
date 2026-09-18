import { useEffect, useState } from "react";
import {
  Alert,
  Button,
  DatePicker,
  Descriptions,
  Form,
  Input,
  InputNumber,
  Modal,
  Radio,
  Select,
  Spin,
  Upload,
  message,
} from "antd";
import type { UploadFile } from "antd/es/upload/interface";
import { PlusOutlined } from "@ant-design/icons";
import dayjs, { type Dayjs } from "dayjs";
import type { LngLat, Utm } from "./helper/geo";
import type { BuildingInfo } from "./helper/leerstandHelper";
import { fetchLocationInfo, type LocationInfo } from "./helper/locationInfo";
import {
  FOTO_ART_KEY,
  GASTRONOMIE_KEY,
  QUELLE_OPTIONS,
  byKey,
  idOfKey,
  type Lookups,
} from "./helper/lookups";
import { compressImage, uploadPhoto } from "./helper/photoUpload";
import { saveLeerstand, type NewLeerstandPhoto } from "./helper/leerstandApi";

export interface PlacedPoint {
  lngLat: LngLat;
  utm: Utm;
  /** ALKIS building that was tapped on the map */
  building?: BuildingInfo;
}

interface LeerstandFormProps {
  jwt: string;
  user: string;
  point: PlacedPoint;
  lookups: Lookups;
  onSaved: (id: number) => void;
  onCancel: () => void;
}

type PhotoField = "fotosAussen" | "fotosLinks" | "fotosRechts" | "fotosInnen";

const PHOTO_GROUPS: {
  name: PhotoField;
  label: string;
  artKey: number;
  min: number;
  max: number;
}[] = [
  { name: "fotosAussen", label: "Außenansicht", artKey: FOTO_ART_KEY.AUSSEN, min: 1, max: 3 },
  { name: "fotosLinks", label: "Zuweg/Umgebung links", artKey: FOTO_ART_KEY.ZUWEG_LINKS, min: 1, max: 3 },
  { name: "fotosRechts", label: "Zuweg/Umgebung rechts", artKey: FOTO_ART_KEY.ZUWEG_RECHTS, min: 1, max: 3 },
  { name: "fotosInnen", label: "Innen", artKey: FOTO_ART_KEY.INNEN, min: 0, max: 5 },
];

/** size class from #4137, derived from the entered area (no separate field) */
export const sizeClass = (qm?: number | null) => {
  if (qm === null || qm === undefined || isNaN(qm)) return undefined;
  if (qm < 100) return "kleiner 100 m²";
  if (qm < 200) return "100–199 m²";
  if (qm < 400) return "200–399 m²";
  if (qm < 800) return "400–799 m²";
  return "größer 800 m²";
};

type VerfuegbarModus = "sofort" | "unbekannt" | "monat";

interface FormValues {
  fotosAussen?: UploadFile[];
  fotosLinks?: UploadFile[];
  fotosRechts?: UploadFile[];
  fotosInnen?: UploadFile[];
  zus_adressangabe?: string;
  flaechengroesse?: number;
  geschosse?: number;
  rolltreppe?: number;
  personenaufzug?: number;
  lastenaufzug?: number;
  vorherige_nutzungsart?: number;
  vorherige_nutzung?: string;
  gastronomie?: number;
  gastronomie_begruendung?: string;
  ausstattung?: string;
  sonstige_hinweise?: string;
  quelle?: string;
  link?: string;
  verfuegbarModus?: VerfuegbarModus;
  verfuegbarMonat?: Dayjs;
}

const fileListFromEvent = (e: unknown) =>
  Array.isArray(e) ? e : (e as { fileList?: UploadFile[] })?.fileList;

const REQUIRED = [{ required: true, message: "Pflichtfeld" }];

export const LeerstandForm = ({
  jwt,
  user,
  point,
  lookups,
  onSaved,
  onCancel,
}: LeerstandFormProps) => {
  const [form] = Form.useForm<FormValues>();
  const [info, setInfo] = useState<LocationInfo>();
  const [infoLoading, setInfoLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState<string>();

  const geschosse = Form.useWatch("geschosse", form);
  const flaeche = Form.useWatch("flaechengroesse", form);
  const gastronomie = Form.useWatch("gastronomie", form);
  const verfuegbarModus = Form.useWatch("verfuegbarModus", form);

  const gastronomieJaId = byKey(lookups.gastronomie, GASTRONOMIE_KEY.JA)?.id;
  const multiStorey = (geschosse ?? 0) > 1;
  const building = point.building;
  const suggestedStoreys = building?.geschosseOberirdisch ?? undefined;

  useEffect(() => {
    let cancelled = false;
    setInfoLoading(true);
    fetchLocationInfo(jwt, point.utm)
      .then((result) => {
        if (!cancelled) setInfo(result);
      })
      .catch((e) => {
        console.warn("[LEERSTAND] location info failed", e);
        if (!cancelled) setInfo({});
      })
      .finally(() => {
        if (!cancelled) setInfoLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [jwt, point, form]);

  const vorhandenOptions = lookups.vorhanden.map((v) => ({
    value: v.id,
    label: v.name,
  }));

  const submit = async () => {
    let values: FormValues;
    try {
      values = await form.validateFields();
    } catch {
      message.warning("Bitte die markierten Pflichtfelder ausfüllen.");
      return;
    }

    setSaving(true);
    try {
      const jobs = PHOTO_GROUPS.flatMap((group) =>
        (values[group.name] ?? []).map((file) => ({
          file: file.originFileObj as File | undefined,
          artId: idOfKey(lookups.fotoArt, group.artKey),
          label: group.label,
        }))
      );
      const photos: NewLeerstandPhoto[] = [];
      let n = 0;
      for (const job of jobs) {
        n += 1;
        setProgress(`Foto ${n} von ${jobs.length} wird hochgeladen …`);
        if (!job.file) continue;
        const blob = await compressImage(job.file);
        const link = await uploadPhoto(jwt, blob);
        photos.push({ link, artId: job.artId, beschreibung: job.label });
      }

      setProgress("Datensatz wird gespeichert …");
      let verfuegbar: string | null = null;
      if (values.verfuegbarModus === "sofort") {
        verfuegbar = dayjs().format("YYYY-MM-DD");
      } else if (values.verfuegbarModus === "monat" && values.verfuegbarMonat) {
        verfuegbar = values.verfuegbarMonat.startOf("month").format("YYYY-MM-DD");
      }

      const id = await saveLeerstand(jwt, user, {
        utm: point.utm,
        zus_adressangabe: values.zus_adressangabe,
        flaechengroesse: values.flaechengroesse!,
        geschosse: values.geschosse!,
        rolltreppe: multiStorey ? values.rolltreppe : undefined,
        personenaufzug: multiStorey ? values.personenaufzug : undefined,
        lastenaufzug: multiStorey ? values.lastenaufzug : undefined,
        vorherige_nutzungsart: values.vorherige_nutzungsart!,
        vorherige_nutzung: values.vorherige_nutzung,
        gastronomie: values.gastronomie!,
        gastronomie_begruendung:
          values.gastronomie === gastronomieJaId
            ? values.gastronomie_begruendung
            : undefined,
        ausstattung: values.ausstattung,
        sonstige_hinweise: values.sonstige_hinweise,
        quelle: values.quelle!,
        link: values.link,
        verfuegbar,
        photos,
      });
      onSaved(id);
    } catch (e) {
      console.error("[LEERSTAND] save failed", e);
      message.error((e as Error).message || "Speichern fehlgeschlagen");
    } finally {
      setSaving(false);
      setProgress(undefined);
    }
  };

  const addressText = building?.mainAddress
    ? building.mainAddress +
      (building.addressCount > 1
        ? ` (+${building.addressCount - 1} weitere Adressen am Gebäude)`
        : "")
    : info?.address
    ? `${info.address.street} ${info.address.number}` +
      (info.address.distance > 15
        ? ` (nächste Adresse, ${Math.round(info.address.distance)} m entfernt)`
        : " (nächste Adresse)")
    : "keine Adresse in der Nähe gefunden";

  const buildingText = building
    ? [
        building.funktion,
        building.geschosseOberirdisch != null
          ? `${building.geschosseOberirdisch} Geschosse`
          : null,
        building.grundflaeche != null
          ? `Grundfläche ${Math.round(building.grundflaeche)} m²`
          : null,
      ]
        .filter(Boolean)
        .join(", ")
    : "–";

  return (
    <Modal
      open
      zIndex={30000001}
      title="Leerstand erfassen"
      onCancel={onCancel}
      maskClosable={false}
      closable={!saving}
      width={640}
      style={{ top: 12 }}
      styles={{ body: { maxHeight: "calc(100vh - 180px)", overflowY: "auto" } }}
      footer={[
        <Button key="cancel" onClick={onCancel} disabled={saving}>
          Abbrechen
        </Button>,
        <Button key="save" type="primary" onClick={submit} loading={saving}>
          Speichern
        </Button>,
      ]}
    >
      {progress && (
        <Alert type="info" showIcon message={progress} style={{ marginBottom: 12 }} />
      )}

      <div style={{ marginBottom: 16 }}>
        {infoLoading ? (
          <Spin size="small" /> 
        ) : (
          <Descriptions size="small" column={1} bordered>
            <Descriptions.Item label="Adresse">{addressText}</Descriptions.Item>
            <Descriptions.Item label="Stadtbezirk">
              {info?.stadtbezirk ?? "–"}
            </Descriptions.Item>
            <Descriptions.Item label="ALKIS-Gebäude">{buildingText}</Descriptions.Item>
          </Descriptions>
        )}
      </div>

      <Form
        form={form}
        layout="vertical"
        requiredMark
        initialValues={{ verfuegbarModus: "sofort", geschosse: suggestedStoreys }}
      >
        {PHOTO_GROUPS.map((group) => (
          <Form.Item
            key={group.name}
            name={group.name}
            label={`Fotos: ${group.label} (${group.min > 0 ? `mindestens ${group.min}, ` : ""}bis zu ${group.max})`}
            valuePropName="fileList"
            getValueFromEvent={fileListFromEvent}
            rules={[
              {
                validator: (_rule, value?: UploadFile[]) =>
                  (value?.length ?? 0) >= group.min
                    ? Promise.resolve()
                    : Promise.reject(new Error(`Mindestens ${group.min} Foto`)),
              },
            ]}
          >
            <Upload
              listType="picture-card"
              accept="image/*"
              multiple
              maxCount={group.max}
              beforeUpload={() => false}
            >
              <div>
                <PlusOutlined />
                <div style={{ marginTop: 4 }}>Foto</div>
              </div>
            </Upload>
          </Form.Item>
        ))}

        <Form.Item
          name="zus_adressangabe"
          label="Zusätzliche Adressangabe"
          extra="z. B. 1. OG im Einkaufszentrum, links/rechts bei zwei Ladenlokalen"
        >
          <Input />
        </Form.Item>

        <Form.Item
          name="flaechengroesse"
          label="Größe der Fläche in m² (notfalls geschätzt)"
          rules={REQUIRED}
          extra={sizeClass(flaeche) ? `Größenklasse: ${sizeClass(flaeche)}` : undefined}
        >
          <InputNumber min={1} step={1} inputMode="decimal" style={{ width: "100%" }} />
        </Form.Item>

        <Form.Item
          name="geschosse"
          label="Anzahl Geschosse (Ladenfläche)"
          rules={REQUIRED}
          extra={
            suggestedStoreys != null
              ? "Vorschlag aus ALKIS (oberirdische Geschosse des Gebäudes)"
              : undefined
          }
        >
          <InputNumber min={1} step={1} precision={0} inputMode="numeric" style={{ width: "100%" }} />
        </Form.Item>

        {multiStorey && (
          <>
            <Form.Item name="rolltreppe" label="Rolltreppe" rules={REQUIRED}>
              <Radio.Group options={vorhandenOptions} optionType="button" />
            </Form.Item>
            <Form.Item name="personenaufzug" label="Personenaufzug" rules={REQUIRED}>
              <Radio.Group options={vorhandenOptions} optionType="button" />
            </Form.Item>
            <Form.Item name="lastenaufzug" label="Lastenaufzug" rules={REQUIRED}>
              <Radio.Group options={vorhandenOptions} optionType="button" />
            </Form.Item>
          </>
        )}

        <Form.Item name="vorherige_nutzungsart" label="Vorherige Nutzungsart" rules={REQUIRED}>
          <Select
            options={lookups.nutzungsart.map((n) => ({ value: n.id, label: n.name }))}
            placeholder="bitte wählen"
          />
        </Form.Item>

        <Form.Item name="vorherige_nutzung" label="Vorherige Nutzung (Name/Firma)">
          <Input />
        </Form.Item>

        <Form.Item name="gastronomie" label="Für Gastronomie interessant?" rules={REQUIRED}>
          <Radio.Group
            options={lookups.gastronomie.map((g) => ({ value: g.id, label: g.name }))}
            optionType="button"
          />
        </Form.Item>

        {gastronomie !== undefined && gastronomie === gastronomieJaId && (
          <Form.Item name="gastronomie_begruendung" label="Begründung" rules={REQUIRED}>
            <Input.TextArea rows={2} />
          </Form.Item>
        )}

        <Form.Item name="ausstattung" label="Ausstattung">
          <Input.TextArea rows={2} />
        </Form.Item>

        <Form.Item name="sonstige_hinweise" label="Sonstige Hinweise">
          <Input.TextArea rows={2} />
        </Form.Item>

        <Form.Item name="quelle" label="Quelle" rules={REQUIRED}>
          <Select
            options={QUELLE_OPTIONS.map((q) => ({ value: q, label: q }))}
            placeholder="bitte wählen"
          />
        </Form.Item>

        <Form.Item name="link" label="Link">
          <Input type="url" inputMode="url" placeholder="https://…" />
        </Form.Item>

        <Form.Item name="verfuegbarModus" label="Verfügbar seit/ab" rules={REQUIRED}>
          <Radio.Group
            optionType="button"
            options={[
              { value: "sofort", label: "sofort (heute)" },
              { value: "monat", label: "Monat/Jahr" },
              { value: "unbekannt", label: "unbekannt" },
            ]}
          />
        </Form.Item>

        {verfuegbarModus === "monat" && (
          <Form.Item name="verfuegbarMonat" label="Monat/Jahr" rules={REQUIRED}>
            <DatePicker picker="month" format="MM/YYYY" style={{ width: "100%" }} />
          </Form.Item>
        )}
      </Form>
    </Modal>
  );
};
