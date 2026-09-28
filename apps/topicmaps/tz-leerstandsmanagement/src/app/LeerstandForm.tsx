import { useEffect, useRef, useState } from "react";
import { DatePicker } from "antd";
import { Modal } from "react-bootstrap";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faArrowUpFromBracket,
  faCircleCheck,
  faXmark,
} from "@fortawesome/free-solid-svg-icons";
import dayjs, { type Dayjs } from "dayjs";
import type { LngLat, Utm } from "./helper/geo";
import type { BuildingInfo } from "./helper/leerstandHelper";
import { fetchLocationInfo, type LocationInfo } from "./helper/locationInfo";
import { useIsDesktop } from "./hooks/useIsDesktop";
import {
  FOTO_ART_KEY,
  GASTRONOMIE_KEY,
  QUELLE_OPTIONS,
  byKey,
  idOfKey,
  type LookupEntry,
  type Lookups,
} from "./helper/lookups";
import { compressImage, uploadPhoto } from "./helper/photoUpload";
import { saveLeerstand, type NewLeerstandPhoto } from "./helper/leerstandApi";
import { Chips, Label, OptionList } from "./components/formPieces";
import {
  PhotoStep,
  type CapturedPhoto,
  type PhotoGroup,
} from "./components/PhotoStep";

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

const PHOTO_GROUPS: PhotoGroup<PhotoField>[] = [
  { name: "fotosAussen", short: "Außen", label: "Außenansicht", artKey: FOTO_ART_KEY.AUSSEN, min: 1, max: 3 },
  { name: "fotosLinks", short: "Links", label: "Zuweg/Umgebung links", artKey: FOTO_ART_KEY.ZUWEG_LINKS, min: 1, max: 3 },
  { name: "fotosRechts", short: "Rechts", label: "Zuweg/Umgebung rechts", artKey: FOTO_ART_KEY.ZUWEG_RECHTS, min: 1, max: 3 },
  { name: "fotosInnen", short: "Innen", label: "Innen", artKey: FOTO_ART_KEY.INNEN, min: 0, max: 5 },
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

const VERFUEGBAR_OPTIONS: { value: VerfuegbarModus; label: string }[] = [
  { value: "sofort", label: "sofort (heute)" },
  { value: "monat", label: "Monat/Jahr" },
  { value: "unbekannt", label: "unbekannt" },
];

interface Draft {
  photos: Record<PhotoField, CapturedPhoto[]>;
  zus_adressangabe: string;
  /** as typed, a decimal comma is fine */
  flaeche: string;
  geschosse?: number;
  rolltreppe?: number;
  personenaufzug?: number;
  lastenaufzug?: number;
  vorherige_nutzungsart?: number;
  vorherige_nutzung: string;
  gastronomie?: number;
  gastronomie_begruendung: string;
  ausstattung: string;
  sonstige_hinweise: string;
  quelle?: string;
  link: string;
  verfuegbarModus: VerfuegbarModus;
  verfuegbarMonat?: Dayjs;
}

const STEPS = [
  {
    title: "Fotos vom Rundgang",
    hint: "Außen, links und rechts brauchen je mindestens ein Foto, innen ist freiwillig.",
  },
  {
    title: "Objekt und Fläche",
    hint: "Angaben zur Ladenfläche. Der Vorschlag aus ALKIS ist überschreibbar.",
  },
  {
    title: "Verfügbarkeit und Quelle",
    hint: "Wann ist die Fläche frei und woher stammt die Information?",
  },
  { title: "Prüfen und speichern", hint: "Letzter Blick vor dem Speichern." },
];

const parseFlaeche = (text: string) => {
  const value = parseFloat(text.replace(",", "."));
  return isNaN(value) || value <= 0 ? undefined : value;
};

const trimmed = (text: string) => (text.trim() === "" ? undefined : text.trim());

const lookupOptions = (entries: LookupEntry[]) =>
  entries.map((e) => ({ value: e.id, label: e.name }));

const nameOf = (entries: LookupEntry[], id?: number) =>
  entries.find((e) => e.id === id)?.name;

let photoCounter = 0;

export const LeerstandForm = ({
  jwt,
  user,
  point,
  lookups,
  onSaved,
  onCancel,
}: LeerstandFormProps) => {
  const building = point.building;
  const suggestedStoreys = building?.geschosseOberirdisch ?? undefined;

  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<Draft>(() => ({
    photos: { fotosAussen: [], fotosLinks: [], fotosRechts: [], fotosInnen: [] },
    zus_adressangabe: "",
    flaeche: "",
    geschosse: suggestedStoreys,
    vorherige_nutzung: "",
    gastronomie_begruendung: "",
    ausstattung: "",
    sonstige_hinweise: "",
    link: "",
    verfuegbarModus: "sofort",
  }));
  const [info, setInfo] = useState<LocationInfo>();
  const [infoLoading, setInfoLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState<string>();
  const [saveError, setSaveError] = useState<string>();
  const [confirmCancel, setConfirmCancel] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);
  const isDesktop = useIsDesktop();
  // photo id -> public URL, so a retry after a failed save uploads nothing twice
  const uploaded = useRef(new Map<string, string>());
  const draftRef = useRef(draft);
  draftRef.current = draft;

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  const gastronomieJaId = byKey(lookups.gastronomie, GASTRONOMIE_KEY.JA)?.id;
  const gastronomieJa =
    draft.gastronomie !== undefined && draft.gastronomie === gastronomieJaId;
  const multiStorey = (draft.geschosse ?? 0) > 1;
  const flaeche = parseFlaeche(draft.flaeche);

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
  }, [jwt, point]);

  useEffect(() => {
    bodyRef.current?.scrollTo({ top: 0 });
  }, [step]);

  // thumbnails are object URLs; free them when the dialog goes away
  useEffect(
    () => () => {
      Object.values(draftRef.current.photos)
        .flat()
        .forEach((photo) => URL.revokeObjectURL(photo.url));
    },
    []
  );

  const addPhotos = (group: PhotoField, files: File[]) => {
    const max = PHOTO_GROUPS.find((g) => g.name === group)?.max ?? 0;
    const room = Math.max(0, max - draftRef.current.photos[group].length);
    const added = files.slice(0, room).map((file) => ({
      id: `p${(photoCounter += 1)}`,
      file,
      url: URL.createObjectURL(file),
    }));
    setDraft((d) => ({
      ...d,
      photos: { ...d.photos, [group]: [...d.photos[group], ...added].slice(0, max) },
    }));
  };

  const removePhoto = (group: PhotoField, id: string) => {
    const photo = draftRef.current.photos[group].find((p) => p.id === id);
    if (photo) URL.revokeObjectURL(photo.url);
    uploaded.current.delete(id);
    setDraft((d) => ({
      ...d,
      photos: { ...d.photos, [group]: d.photos[group].filter((p) => p.id !== id) },
    }));
  };

  const missing: { label: string; step: number }[] = [];
  for (const group of PHOTO_GROUPS) {
    if (draft.photos[group.name].length < group.min) {
      missing.push({ label: `Foto ${group.label} fehlt`, step: 0 });
    }
  }
  if (flaeche === undefined) missing.push({ label: "Größe der Fläche fehlt", step: 1 });
  if (draft.geschosse === undefined) missing.push({ label: "Anzahl Geschosse fehlt", step: 1 });
  if (
    multiStorey &&
    (draft.rolltreppe === undefined ||
      draft.personenaufzug === undefined ||
      draft.lastenaufzug === undefined)
  ) {
    missing.push({ label: "Angaben zu Rolltreppe und Aufzügen fehlen", step: 1 });
  }
  if (draft.vorherige_nutzungsart === undefined) {
    missing.push({ label: "Vorherige Nutzungsart fehlt", step: 1 });
  }
  if (draft.gastronomie === undefined) {
    missing.push({ label: "Gastronomie-Einschätzung fehlt", step: 2 });
  }
  if (gastronomieJa && !trimmed(draft.gastronomie_begruendung)) {
    missing.push({ label: "Begründung Gastronomie fehlt", step: 2 });
  }
  if (draft.verfuegbarModus === "monat" && !draft.verfuegbarMonat) {
    missing.push({ label: "Monat der Verfügbarkeit fehlt", step: 2 });
  }
  if (!draft.quelle) missing.push({ label: "Quelle fehlt", step: 2 });

  const submit = async () => {
    if (missing.length > 0 || saving) return;
    setSaving(true);
    setSaveError(undefined);
    try {
      const jobs = PHOTO_GROUPS.flatMap((group) =>
        draft.photos[group.name].map((photo) => ({
          photo,
          artId: idOfKey(lookups.fotoArt, group.artKey),
          label: group.label,
        }))
      );
      const photos: NewLeerstandPhoto[] = [];
      let n = 0;
      for (const job of jobs) {
        n += 1;
        setProgress(`Foto ${n} von ${jobs.length} wird hochgeladen …`);
        let link = uploaded.current.get(job.photo.id);
        if (!link) {
          const blob = await compressImage(job.photo.file);
          link = await uploadPhoto(jwt, blob);
          uploaded.current.set(job.photo.id, link);
        }
        photos.push({ link, artId: job.artId, beschreibung: job.label });
      }

      setProgress("Datensatz wird gespeichert …");
      let verfuegbar: string | null = null;
      if (draft.verfuegbarModus === "sofort") {
        verfuegbar = dayjs().format("YYYY-MM-DD");
      } else if (draft.verfuegbarModus === "monat" && draft.verfuegbarMonat) {
        verfuegbar = draft.verfuegbarMonat.startOf("month").format("YYYY-MM-DD");
      }

      const id = await saveLeerstand(jwt, user, {
        utm: point.utm,
        zus_adressangabe: trimmed(draft.zus_adressangabe),
        flaechengroesse: flaeche!,
        geschosse: draft.geschosse!,
        rolltreppe: multiStorey ? draft.rolltreppe : undefined,
        personenaufzug: multiStorey ? draft.personenaufzug : undefined,
        lastenaufzug: multiStorey ? draft.lastenaufzug : undefined,
        vorherige_nutzungsart: draft.vorherige_nutzungsart!,
        vorherige_nutzung: trimmed(draft.vorherige_nutzung),
        gastronomie: draft.gastronomie!,
        gastronomie_begruendung: gastronomieJa
          ? trimmed(draft.gastronomie_begruendung)
          : undefined,
        ausstattung: trimmed(draft.ausstattung),
        sonstige_hinweise: trimmed(draft.sonstige_hinweise),
        quelle: draft.quelle!,
        link: trimmed(draft.link),
        verfuegbar,
        photos,
      });
      onSaved(id);
    } catch (e) {
      console.error("[LEERSTAND] save failed", e);
      setSaveError((e as Error).message || "Speichern fehlgeschlagen");
    } finally {
      setSaving(false);
      setProgress(undefined);
    }
  };

  const photoTotal = PHOTO_GROUPS.reduce((sum, g) => sum + draft.photos[g.name].length, 0);
  const dirty =
    photoTotal > 0 ||
    draft.flaeche !== "" ||
    draft.vorherige_nutzungsart !== undefined ||
    draft.gastronomie !== undefined ||
    draft.quelle !== undefined ||
    [
      draft.zus_adressangabe,
      draft.vorherige_nutzung,
      draft.gastronomie_begruendung,
      draft.ausstattung,
      draft.sonstige_hinweise,
      draft.link,
    ].some((text) => text.trim() !== "");

  const cancel = () => {
    if (saving) return;
    if (dirty) setConfirmCancel(true);
    else onCancel();
  };

  const back = () => {
    if (step === 0) cancel();
    else setStep(step - 1);
  };

  const last = step === STEPS.length - 1;
  const next = () => {
    if (last) submit();
    else setStep(step + 1);
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

  const FEHLT = "fehlt";
  const summary: { k: string; v: string; miss?: boolean }[] = [
    { k: "Adresse", v: infoLoading && !building?.mainAddress ? "wird ermittelt …" : addressText },
    { k: "Stadtbezirk", v: infoLoading ? "wird ermittelt …" : info?.stadtbezirk ?? "–" },
    { k: "ALKIS-Gebäude", v: buildingText },
    { k: "Zusatz", v: trimmed(draft.zus_adressangabe) ?? "–" },
    {
      k: "Fotos",
      v: PHOTO_GROUPS.map(
        (g) => `${draft.photos[g.name].length} ${g.short.toLowerCase()}`
      ).join(" · "),
    },
    {
      k: "Fläche",
      v:
        flaeche !== undefined
          ? `${flaeche.toLocaleString("de-DE")} m² (${sizeClass(flaeche)})`
          : FEHLT,
      miss: flaeche === undefined,
    },
    {
      k: "Geschosse",
      v:
        draft.geschosse === undefined
          ? FEHLT
          : String(draft.geschosse) +
            (multiStorey
              ? ` · Rolltreppe ${nameOf(lookups.vorhanden, draft.rolltreppe) ?? "?"}` +
                `, Personenaufzug ${nameOf(lookups.vorhanden, draft.personenaufzug) ?? "?"}` +
                `, Lastenaufzug ${nameOf(lookups.vorhanden, draft.lastenaufzug) ?? "?"}`
              : ""),
      miss: draft.geschosse === undefined,
    },
    {
      k: "Nutzungsart",
      v: nameOf(lookups.nutzungsart, draft.vorherige_nutzungsart) ?? FEHLT,
      miss: draft.vorherige_nutzungsart === undefined,
    },
    { k: "Vorherige Nutzung", v: trimmed(draft.vorherige_nutzung) ?? "–" },
    {
      k: "Gastronomie",
      v:
        draft.gastronomie === undefined
          ? FEHLT
          : gastronomieJa
          ? `${nameOf(lookups.gastronomie, draft.gastronomie)}: ${
              trimmed(draft.gastronomie_begruendung) ?? "Begründung fehlt"
            }`
          : nameOf(lookups.gastronomie, draft.gastronomie) ?? "–",
      miss:
        draft.gastronomie === undefined ||
        (gastronomieJa && !trimmed(draft.gastronomie_begruendung)),
    },
    {
      k: "Verfügbar",
      v:
        draft.verfuegbarModus === "sofort"
          ? "sofort (heute)"
          : draft.verfuegbarModus === "monat"
          ? draft.verfuegbarMonat?.format("MM/YYYY") ?? "Monat fehlt"
          : "unbekannt",
      miss: draft.verfuegbarModus === "monat" && !draft.verfuegbarMonat,
    },
    { k: "Quelle", v: draft.quelle ?? FEHLT, miss: !draft.quelle },
  ];
  if (trimmed(draft.link)) summary.push({ k: "Link", v: draft.link.trim() });
  if (trimmed(draft.ausstattung)) summary.push({ k: "Ausstattung", v: draft.ausstattung.trim() });
  if (trimmed(draft.sonstige_hinweise)) {
    summary.push({ k: "Sonstige Hinweise", v: draft.sonstige_hinweise.trim() });
  }

  const vorhandenOptions = lookupOptions(lookups.vorhanden);

  const stepLabel = `Schritt ${step + 1} von ${STEPS.length}`;

  // The pieces of the dialog, shared by both shells below: the full screen
  // one for phones and the regular modal for the desktop.
  const stepHead = (
    <>
      <div className="ls-wiz-bars">
        {STEPS.map((s, i) => (
          <i key={s.title} className={i <= step ? "ls-on" : undefined} />
        ))}
      </div>
      <h2 className="ls-wiz-title">{STEPS[step].title}</h2>
      <div className="ls-wiz-hint">{STEPS[step].hint}</div>
    </>
  );

  const stepContent = (
    <>
      {step === 0 && (
        <PhotoStep
          groups={PHOTO_GROUPS}
          photos={draft.photos}
          onAdd={addPhotos}
          onRemove={removePhoto}
        />
      )}

      {step === 1 && (
        <div>
          <Label required htmlFor="ls-flaeche">
            Größe der Fläche in m²
          </Label>
          <input
            id="ls-flaeche"
            className="ls-inp"
            style={{ fontSize: 19, fontWeight: 500 }}
            inputMode="decimal"
            placeholder="notfalls geschätzt"
            value={draft.flaeche}
            onChange={(e) => set("flaeche", e.target.value)}
          />
          <div className="ls-help">
            Größenklasse: <b>{sizeClass(flaeche) ?? "–"}</b>
          </div>

          <Label required gap>
            Anzahl Geschosse (Ladenfläche)
          </Label>
          <div className="ls-stepper">
            <button
              type="button"
              className="ls-btn ls-act"
              aria-label="Ein Geschoss weniger"
              onClick={() => set("geschosse", Math.max(1, (draft.geschosse ?? 1) - 1))}
            >
              −
            </button>
            <input
              className="ls-stepper-val"
              inputMode="numeric"
              aria-label="Anzahl Geschosse"
              placeholder="–"
              value={draft.geschosse ?? ""}
              onChange={(e) => {
                const n = parseInt(e.target.value.replace(/\D/g, ""), 10);
                set("geschosse", isNaN(n) || n < 1 ? undefined : n);
              }}
              onFocus={(e) => e.target.select()}
            />
            <button
              type="button"
              className="ls-btn ls-act"
              aria-label="Ein Geschoss mehr"
              onClick={() => set("geschosse", (draft.geschosse ?? 0) + 1)}
            >
              +
            </button>
          </div>
          {suggestedStoreys != null && (
            <div className="ls-help">
              Vorschlag aus ALKIS: {suggestedStoreys} oberirdische{" "}
              {suggestedStoreys === 1 ? "Geschoss" : "Geschosse"} des Gebäudes.
            </div>
          )}

          {multiStorey && (
            <div className="ls-cond" style={{ marginTop: 18 }}>
              <div className="ls-cond-note">
                Weil die Ladenfläche über mehr als ein Geschoss geht, brauchen
                wir noch drei Angaben.
              </div>
              <div className="ls-cond-title">Rolltreppe</div>
              <Chips
                options={vorhandenOptions}
                value={draft.rolltreppe}
                onChange={(v) => set("rolltreppe", v)}
              />
              <div className="ls-cond-title">Personenaufzug</div>
              <Chips
                options={vorhandenOptions}
                value={draft.personenaufzug}
                onChange={(v) => set("personenaufzug", v)}
              />
              <div className="ls-cond-title">Lastenaufzug</div>
              <Chips
                options={vorhandenOptions}
                value={draft.lastenaufzug}
                onChange={(v) => set("lastenaufzug", v)}
              />
            </div>
          )}

          <Label required gap>
            Vorherige Nutzungsart
          </Label>
          <OptionList
            options={lookupOptions(lookups.nutzungsart)}
            value={draft.vorherige_nutzungsart}
            onChange={(v) => set("vorherige_nutzungsart", v)}
          />

          <Label gap htmlFor="ls-vornutzung">
            Vorherige Nutzung (Name/Firma)
          </Label>
          <input
            id="ls-vornutzung"
            className="ls-inp"
            placeholder="optional"
            value={draft.vorherige_nutzung}
            onChange={(e) => set("vorherige_nutzung", e.target.value)}
          />

          <Label gap htmlFor="ls-zusatz">
            Zusätzliche Adressangabe
          </Label>
          <input
            id="ls-zusatz"
            className="ls-inp"
            placeholder="z. B. 1. OG im Einkaufszentrum, links"
            value={draft.zus_adressangabe}
            onChange={(e) => set("zus_adressangabe", e.target.value)}
          />
        </div>
      )}

      {step === 2 && (
        <div>
          <Label required>Für Gastronomie interessant?</Label>
          <Chips
            options={lookupOptions(lookups.gastronomie)}
            value={draft.gastronomie}
            onChange={(v) => set("gastronomie", v)}
          />
          {gastronomieJa && (
            <div className="ls-cond">
              <label className="ls-cond-title" htmlFor="ls-begruendung" style={{ display: "block", marginBottom: 8 }}>
                Begründung <span className="ls-req" style={{ fontWeight: 500 }}>Pflicht</span>
              </label>
              <textarea
                id="ls-begruendung"
                className="ls-inp"
                rows={3}
                placeholder="Warum eignet sich die Fläche für Gastronomie?"
                value={draft.gastronomie_begruendung}
                onChange={(e) => set("gastronomie_begruendung", e.target.value)}
              />
            </div>
          )}

          <Label required gap>
            Verfügbar seit/ab
          </Label>
          <Chips
            options={VERFUEGBAR_OPTIONS}
            value={draft.verfuegbarModus}
            onChange={(v) => set("verfuegbarModus", v)}
          />
          {draft.verfuegbarModus === "monat" && (
            <div className="ls-cond">
              <div className="ls-cond-title" style={{ marginBottom: 10 }}>
                Monat und Jahr
              </div>
              <DatePicker
                className="ls-month"
                picker="month"
                format="MM/YYYY"
                placeholder="Monat wählen"
                inputReadOnly
                value={draft.verfuegbarMonat}
                onChange={(value) => set("verfuegbarMonat", value ?? undefined)}
              />
            </div>
          )}

          <Label required gap>
            Quelle
          </Label>
          <OptionList
            options={QUELLE_OPTIONS.map((q) => ({ value: q, label: q }))}
            value={draft.quelle}
            onChange={(v) => set("quelle", v)}
          />

          <Label gap htmlFor="ls-link">
            Link
          </Label>
          <input
            id="ls-link"
            className="ls-inp"
            type="url"
            inputMode="url"
            placeholder="https://…"
            value={draft.link}
            onChange={(e) => set("link", e.target.value)}
          />

          <Label gap htmlFor="ls-ausstattung">
            Ausstattung
          </Label>
          <textarea
            id="ls-ausstattung"
            className="ls-inp"
            rows={3}
            placeholder="optional"
            value={draft.ausstattung}
            onChange={(e) => set("ausstattung", e.target.value)}
          />

          <Label gap htmlFor="ls-hinweise">
            Sonstige Hinweise
          </Label>
          <textarea
            id="ls-hinweise"
            className="ls-inp"
            rows={3}
            placeholder="optional"
            value={draft.sonstige_hinweise}
            onChange={(e) => set("sonstige_hinweise", e.target.value)}
          />
        </div>
      )}

      {step === 3 && (
        <div>
          {missing.length > 0 ? (
            <div className="ls-note ls-note-bad" style={{ marginBottom: 16, padding: "14px 16px" }}>
              <div className="ls-missing-title">
                {missing.length === 1
                  ? "Eine Pflichtangabe fehlt noch"
                  : `${missing.length} Pflichtangaben fehlen noch`}
              </div>
              {missing.map((m) => (
                <button
                  key={m.label}
                  type="button"
                  className="ls-missing-item"
                  onClick={() => setStep(m.step)}
                >
                  <span>{m.label}</span>
                  <span>Schritt {m.step + 1}</span>
                </button>
              ))}
            </div>
          ) : (
            <div className="ls-note ls-note-ok" style={{ marginBottom: 16, padding: "14px 16px" }}>
              <FontAwesomeIcon icon={faCircleCheck} />
              Alle Pflichtangaben sind vollständig.
            </div>
          )}
          <div className="ls-rows">
            {summary.map((row) => (
              <div key={row.k} className="ls-row">
                <div className="ls-row-k">{row.k}</div>
                <div className={"ls-row-v" + (row.miss ? " ls-miss" : "")}>{row.v}</div>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 14, fontSize: 13, color: "var(--ls-faint)" }}>
            Erfasser und Zeitstempel setzt die App beim Speichern: {user}, heute.
          </div>
        </div>
      )}
    </>
  );

  const status = (
    <>
      {saving && progress && (
        <div className="ls-wiz-status">
          <div className="ls-note ls-note-info">
            <FontAwesomeIcon icon={faArrowUpFromBracket} />
            {progress}
          </div>
        </div>
      )}
      {saveError && !saving && (
        <div className="ls-wiz-status">
          <div className="ls-note ls-note-bad">
            Speichern fehlgeschlagen: {saveError}. Die Eingaben bleiben erhalten,
            bitte erneut versuchen.
          </div>
        </div>
      )}
    </>
  );

  const footButtons = (
    <>
      <button type="button" className="ls-btn ls-sec" onClick={back} disabled={saving}>
        {step === 0 ? "Abbrechen" : "Zurück"}
      </button>
      <button
        type="button"
        className="ls-btn ls-pri"
        onClick={next}
        disabled={saving || (last && missing.length > 0)}
      >
        {!last
          ? "Weiter"
          : missing.length > 0
          ? "Erst Pflichtangaben"
          : saving
          ? "Speichert …"
          : "Speichern"}
      </button>
    </>
  );

  const confirmSheet = confirmCancel && (
    <div className="ls-wiz-confirm">
      <div className="ls-wiz-confirm-sheet">
        <div className="ls-wiz-confirm-title">Erfassung verwerfen?</div>
        <div className="ls-wiz-confirm-text">
          Die App speichert nichts zwischen. Fotos und Angaben dieser
          Erfassung gehen verloren.
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button
            type="button"
            className="ls-btn ls-sec"
            style={{ flex: 1 }}
            onClick={onCancel}
          >
            Verwerfen
          </button>
          <button
            type="button"
            className="ls-btn ls-pri"
            style={{ flex: 1 }}
            onClick={() => setConfirmCancel(false)}
          >
            Weiter erfassen
          </button>
        </div>
      </div>
    </div>
  );

  if (isDesktop) {
    return (
      <Modal
        show
        onHide={cancel}
        backdrop="static"
        keyboard={!saving}
        // the antd month picker opens outside the modal
        enforceFocus={false}
        size="lg"
        className="ls-wiz-modal"
        backdropClassName="ls-wiz-modal-backdrop"
        dialogClassName="modal-dialog-scrollable"
        aria-label="Leerstand erfassen"
      >
        <Modal.Header closeButton={!saving}>
          <Modal.Title>Leerstand erfassen</Modal.Title>
          <span className="ls-wiz-step ls-wiz-step-modal">{stepLabel}</span>
        </Modal.Header>
        <Modal.Body ref={bodyRef}>
          {stepHead}
          <div className="ls-wiz-modal-content">{stepContent}</div>
        </Modal.Body>
        <Modal.Footer className="ls-wiz-modal-foot">
          {status}
          {footButtons}
        </Modal.Footer>
        {confirmSheet}
      </Modal>
    );
  }

  return (
    <div className="ls-wiz-backdrop">
      <div className="ls-wiz" role="dialog" aria-modal="true" aria-label="Leerstand erfassen">
        <div className="ls-wiz-hd">
          <div className="ls-wiz-hd-top">
            <button
              type="button"
              className="ls-wiz-x"
              onClick={cancel}
              disabled={saving}
              aria-label="Erfassung abbrechen"
            >
              <FontAwesomeIcon icon={faXmark} />
            </button>
            <span className="ls-wiz-step">{stepLabel}</span>
            <span style={{ width: 40 }} />
          </div>
          {stepHead}
        </div>

        <div className="ls-wiz-body" ref={bodyRef}>
          {stepContent}
        </div>

        {status}

        <div className="ls-wiz-foot">{footButtons}</div>

        {confirmSheet}
      </div>
    </div>
  );
};
