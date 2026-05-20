import { useEffect, useMemo, useRef } from "react";
import {
  Form,
  Row,
  Col,
  Select,
  Input,
  DatePicker,
  Checkbox,
  InputNumber,
} from "antd";
import { useSelector } from "react-redux";
import { getKeyTablesData } from "../../../store/slices/keyTables";
import StrassenschluesselFields from "./StrassenschluesselFields";
import StrassenschluesselFieldsModal from "./StrassenschluesselFieldsModal";
import { getFormClassName, getPlaceholder } from "./readOnlyFormUtils";
import { FormItem } from "./DraftFieldHighlight";
import toTitleCase from "../../../helper/toTitleCase";
import dayjs from "dayjs";

// Helper to sort options based on display text (same sorting as KeyTablesPage)
type SortMode = "none" | "alphabetical" | "numeric";

const sortOptions = <T,>(
  options: T[],
  getDisplayText: (item: T) => string,
  sortMode: SortMode = "none"
): T[] => {
  if (sortMode === "none") return options;
  return [...options].sort((a, b) => {
    const aText = getDisplayText(a);
    const bText = getDisplayText(b);
    if (sortMode === "alphabetical") {
      return aText.localeCompare(bText, "de", { sensitivity: "base" });
    }
    if (sortMode === "numeric") {
      return aText.localeCompare(bText, "de", { numeric: true });
    }
    return 0;
  });
};

interface LeuchteFormFieldsProps {
  leuchte: Record<string, unknown> | null;
  namePrefix?: string;
  readOnly?: boolean;
  isCreation?: boolean;
  /** Identity of the underlying draft/feature. Used to re-run the form
   * reset effect when the user switches between drafts that all share the
   * same `leuchte` reference (e.g. multiple in-progress creation drafts
   * where `leuchte` is always null). */
  featureId?: string;
  /** When true, omit the Strassenschluessel field. Used in the new-Leuchte
   * creation flow where the field is rendered on the Standort tab instead. */
  hideStrassenschluessel?: boolean;
  form?: import("antd").FormInstance;
  onFormInstance?: (form: import("antd").FormInstance) => void;
  draftValues?: Record<string, unknown>;
  /** Current Mast/Standort draft slice. When passed in the creation flow, the
   * form subscribes to Strassenschluessel/Kennziffer changes and applies them
   * locally — Strassenschluessel unconditionally, Kennziffer with a sticky
   * per-form override (once the user edits this tab's Kennziffer, it stops
   * accepting Standort updates). Pull-from-Redux replaces the older parent-
   * pushed mirror so newly added Leuchten tabs catch up at mount. */
  mastDraftValues?: Record<string, unknown>;
  onValuesChange?: (
    changedValues: Record<string, unknown>,
    allValues: Record<string, unknown>
  ) => void;
  onOriginalValues?: (values: Record<string, unknown>) => void;
}

interface LeuchttypItem {
  id: number;
  leuchtentyp?: string;
  fabrikat?: string;
}

interface KennzifferItem {
  id: number;
  kennziffer?: string;
  beschreibung?: string;
}

interface EnergielieferantItem {
  id: number;
  energielieferant?: string;
}

interface RundsteuerempfaengerItem {
  id: number;
  rs_typ?: string;
}

interface DoppelkommandoItem {
  id: number;
  pk?: string;
  beschreibung?: string;
}

interface UnterhaltLeuchteItem {
  id: number;
  pk?: number;
  unterhaltspflichtiger_leuchte?: string;
}

interface LeuchtmittelItem {
  id: number;
  lichtfarbe?: string;
  hersteller?: string;
}

// Helper type for nested objects with common properties
interface NestedObject {
  id?: number;
  pk?: string;
  strasse?: string;
}

const FormLabel = ({ children }: { children: React.ReactNode }) => (
  <span className="text-sm font-medium text-gray-700">{children}</span>
);

const LeuchteFormFields = ({
  leuchte,
  namePrefix,
  readOnly = true,
  isCreation,
  featureId,
  hideStrassenschluessel = false,
  form: externalForm,
  onFormInstance,
  draftValues,
  mastDraftValues,
  onValuesChange,
  onOriginalValues,
}: LeuchteFormFieldsProps) => {
  const [localForm] = Form.useForm();
  const form = externalForm ?? localForm;
  const draftApplied = useRef(false);
  const appliedForFeatureRef = useRef<string | number | undefined>(undefined);
  useEffect(() => {
    if (!externalForm) onFormInstance?.(form);
  }, [form, onFormInstance, externalForm]);
  const keyTablesData = useSelector(getKeyTablesData);

  // Key table options (sorted to match KeyTablesPage display order)
  const leuchttypOptions = useMemo(
    () =>
      sortOptions(
        (keyTablesData.leuchtentyp || []) as LeuchttypItem[],
        (item) => `${item.leuchtentyp || ""} ${item.fabrikat || ""}`.trim(),
        "alphabetical"
      ),
    [keyTablesData.leuchtentyp]
  );
  const kennzifferOptions = useMemo(() => {
    const sorted = sortOptions(
      (keyTablesData.kennziffer || []) as KennzifferItem[],
      (item) => `${item.kennziffer || ""} - ${item.beschreibung || ""}`,
      "numeric"
    );
    // "1 - nur Mast" is meaningless when creating a Leuchte (a lamp is not
    // just a mast). Existing Leuchten that legacy-carry kennziffer=1 still
    // see the option in edit mode so their current value stays visible.
    return isCreation
      ? sorted.filter((item) => String(item.kennziffer) !== "1")
      : sorted;
  }, [keyTablesData.kennziffer, isCreation]);
  const energielieferantOptions = useMemo(
    () =>
      sortOptions(
        (keyTablesData.energielieferant || []) as EnergielieferantItem[],
        (item) => item.energielieferant || "",
        "alphabetical"
      ),
    [keyTablesData.energielieferant]
  );
  const doppelkommandoOptions = useMemo(
    () =>
      sortOptions(
        (keyTablesData.doppelkommando || []) as DoppelkommandoItem[],
        (item) => `${item.pk || ""} - ${item.beschreibung || ""}`,
        "numeric"
      ),
    [keyTablesData.doppelkommando]
  );
  const unterhaltLeuchteOptions = useMemo(
    () =>
      sortOptions(
        (keyTablesData.unterhaltLeuchte || []) as UnterhaltLeuchteItem[],
        (item) =>
          `${item.pk ?? ""} - ${item.unterhaltspflichtiger_leuchte || ""}`,
        "numeric"
      ),
    [keyTablesData.unterhaltLeuchte]
  );
  const leuchtmittelOptions = (keyTablesData.leuchtmittel ||
    []) as LeuchtmittelItem[];
  const rundsteuerempfaengerOptions = useMemo(
    () =>
      sortOptions(
        (keyTablesData["rundsteuerempfänger"] ||
          []) as RundsteuerempfaengerItem[],
        (item) => `${item.rs_typ || ""}`,
        "alphabetical"
      ),
    [keyTablesData["rundsteuerempfänger"]]
  );

  // Helper to create field name with optional prefix
  const fieldName = (name: string) => (namePrefix ? [namePrefix, name] : name);

  useEffect(() => {
    if (externalForm) return;
    if (!leuchte) return;

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

    {
      const strassenschluessel = leuchte.tkey_strassenschluessel as
        | NestedObject
        | undefined;
      const kennziffer = leuchte.tkey_kennziffer as NestedObject | undefined;
      const leuchtentyp = leuchte.tkey_leuchtentyp as NestedObject | undefined;
      const energielieferant = leuchte.tkey_energielieferant as
        | NestedObject
        | undefined;
      const rundsteuerempfaenger = leuchte.rundsteuerempfaengerObject as
        | NestedObject
        | undefined;
      const dk1Object = leuchte.fk_dk1Object as NestedObject | undefined;
      const dk2Object = leuchte.fk_dk2Object as NestedObject | undefined;
      const unterhLeuchte = leuchte.tkey_unterh_leuchte as
        | NestedObject
        | undefined;
      const leuchtmittelObj = leuchte.leuchtmittelObject as
        | NestedObject
        | undefined;

      const serverValues = {
        // Straßenschlüssel
        strassenschluessel_pk: strassenschluessel?.pk,
        strassenschluessel_strasse: strassenschluessel?.strasse
          ? toTitleCase(strassenschluessel.strasse)
          : undefined,
        // Kennziffer - use id for Select value
        fk_kennziffer: kennziffer?.id ?? null,
        // Laufende Nr. / Leuchtennummer
        lfd_nummer: leuchte.lfd_nummer,
        leuchtennummer: leuchte.leuchtennummer,
        // Leuchtentyp - use id for Select value
        fk_leuchttyp: leuchtentyp?.id ?? null,
        // Inbetriebnahme / Zähler
        inbetriebnahme_leuchte: leuchte.inbetriebnahme_leuchte
          ? dayjs(leuchte.inbetriebnahme_leuchte as string)
          : null,
        zaehler: leuchte.zaehler,
        // Montagefirma
        montagefirma_leuchte: leuchte.montagefirma_leuchte,
        // Energielieferant - use id for Select value
        fk_energielieferant: energielieferant?.id ?? null,
        // Schaltstelle
        schaltstelle: leuchte.schaltstelle,
        // Rundsteuerempfänger - use id for Select value
        rundsteuerempfaenger: rundsteuerempfaenger?.id ?? null,
        // Einbaudatum
        einbaudatum: leuchte.einbaudatum
          ? dayjs(leuchte.einbaudatum as string)
          : null,
        // Doppelkommando 1 - use id for Select value
        fk_dk1: dk1Object?.id ?? leuchte.fk_dk1,
        anzahl_1dk: leuchte.anzahl_1dk,
        anschlussleistung_1dk: leuchte.anschlussleistung_1dk,
        // Doppelkommando 2 - use id for Select value
        fk_dk2: dk2Object?.id ?? leuchte.fk_dk2,
        anzahl_2dk: leuchte.anzahl_2dk,
        anschlussleistung_2dk: leuchte.anschlussleistung_2dk,
        // Unterhalt Leuchte - use id for Select value
        fk_unterhaltspflicht_leuchte: unterhLeuchte?.id ?? null,
        // Leuchtmittelwechsel
        wechseldatum: leuchte.wechseldatum
          ? dayjs(leuchte.wechseldatum as string)
          : null,
        naechster_wechsel: leuchte.naechster_wechsel
          ? dayjs(leuchte.naechster_wechsel as string)
          : null,
        // Leuchtmittel - use id for Select value
        leuchtmittel: leuchtmittelObj?.id ?? leuchte.leuchtmittel,
        // Lebensdauer
        lebensdauer: leuchte.lebensdauer,
        // Sonderturnus
        sonderturnus: leuchte.wartungszyklus
          ? dayjs(leuchte.wartungszyklus as string)
          : null,
        // Vorschaltgerät
        vorschaltgeraet: leuchte.vorschaltgeraet,
        // Erneuerung VG
        wechselvorschaltgeraet: leuchte.wechselvorschaltgeraet
          ? dayjs(leuchte.wechselvorschaltgeraet as string)
          : null,
        // Bemerkung
        bemerkungen: leuchte.bemerkungen,
      };
      form.setFieldsValue(serverValues);
      onOriginalValues?.(form.getFieldsValue());

      if (draftValues) {
        form.setFieldsValue(draftValues);
        draftApplied.current = true;
      }
    }

    appliedForFeatureRef.current = featureId;
    // Depend on the `leuchte` reference so post-save refetches re-populate
    // automatically; the featureChanged/isCreationFeature guards above filter
    // out the synthetic-record churn during creation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [featureId, leuchte, form]);

  useEffect(() => {
    if (externalForm) return;
    if (draftApplied.current || !draftValues) return;
    form.setFieldsValue(draftValues);
    draftApplied.current = true;
  }, [draftValues, form, externalForm]);

  // `setFieldsValue` doesn't trigger antd's `onValuesChange`, so the parent's
  // Redux draft wouldn't learn about the mirrored Strassenschluessel/Kennziffer
  // until the user touches some other field. That delay leaves green-highlight
  // diffs reading stale `undefined` values on first render. The ref lets the
  // subscription effects below propagate manually without adding the (often
  // re-created) callback to their dep arrays.
  const onValuesChangeRef = useRef(onValuesChange);
  useEffect(() => {
    onValuesChangeRef.current = onValuesChange;
  });

  // Strassenschluessel subscription: in the creation flow the Strassenschluessel
  // input lives on the Standort tab, not on the Leuchte tab — hideStrassenschluessel
  // hides it locally, but the Leuchte payload still needs fk_strassenschluessel
  // on save. We mirror the current Mast slice into the local form whenever the
  // Mast values change. No per-tab override semantics here: Strassenschluessel
  // is a property of the Standort, every Leuchte at that Standort shares it.
  const mastStrassePk = mastDraftValues?.strassenschluessel_pk;
  const mastStrasseName = mastDraftValues?.strassenschluessel_strasse;
  const mastFkStrasse = mastDraftValues?.fk_strassenschluessel;
  useEffect(() => {
    if (!hideStrassenschluessel) return;
    if (mastFkStrasse == null && mastStrassePk == null) return;
    const changed = {
      strassenschluessel_pk: mastStrassePk,
      strassenschluessel_strasse: mastStrasseName,
      fk_strassenschluessel: mastFkStrasse,
    };
    form.setFieldsValue(changed);
    onValuesChangeRef.current?.(changed, form.getFieldsValue());
  }, [
    hideStrassenschluessel,
    mastFkStrasse,
    mastStrassePk,
    mastStrasseName,
    form,
  ]);

  // Kennziffer subscription with sticky per-form override. While the Leuchte's
  // own fk_kennziffer is empty (or still equals what we last applied), Standort
  // changes flow through. Once the user types a different Kennziffer here, this
  // form opts out — `lastAppliedKennzRef` no longer matches `current`, and the
  // condition gates further updates. Other Leuchten tabs (each with their own
  // ref) are unaffected.
  const lastAppliedKennzRef = useRef<unknown>(undefined);
  const mastKennz = mastDraftValues?.fk_kennziffer;
  useEffect(() => {
    if (!isCreation) return;
    if (mastKennz == null) return;
    const current = form.getFieldValue("fk_kennziffer");
    const isEmpty = current == null || current === "";
    const userOverrode = !isEmpty && current !== lastAppliedKennzRef.current;
    if (userOverrode) return;
    if (current === mastKennz) return;
    form.setFieldsValue({ fk_kennziffer: mastKennz });
    lastAppliedKennzRef.current = mastKennz;
    onValuesChangeRef.current?.(
      { fk_kennziffer: mastKennz },
      form.getFieldsValue()
    );
  }, [mastKennz, isCreation, form]);

  // Laufende Nr. mirror. In the creation flow `lfd_nummer` is a Standort
  // property shared by every Leuchte at that Standort — it's set on the
  // Standort tab and the Leuchte tab's own field is hidden (see below). We
  // mirror the Mast slice unconditionally so the hidden field still carries a
  // value into the save payload. No per-tab override semantics: the field is
  // not editable here, so there is nothing to override.
  const mastLfdNummer = mastDraftValues?.lfd_nummer;
  useEffect(() => {
    if (!isCreation) return;
    if (mastLfdNummer == null) return;
    const current = form.getFieldValue("lfd_nummer");
    if (current === mastLfdNummer) return;
    form.setFieldsValue({ lfd_nummer: mastLfdNummer });
    onValuesChangeRef.current?.(
      { lfd_nummer: mastLfdNummer },
      form.getFieldsValue()
    );
  }, [mastLfdNummer, isCreation, form]);

  return (
    <Form
      form={form}
      layout="vertical"
      requiredMark={false}
      className={getFormClassName(readOnly, "pr-2")}
      onValuesChange={onValuesChange}
    >
      {hideStrassenschluessel ? null : (!leuchte || isCreation) && !readOnly ? (
        <StrassenschluesselFieldsModal
          namePrefix={namePrefix}
          onSyncDerivedValues={onValuesChange}
        />
      ) : (
        <StrassenschluesselFields namePrefix={namePrefix} />
      )}

      {/* Kennziffer — in the creation flow this is set on the Standort tab.
          The field stays mounted (hidden) so the mirrored value is still
          submitted to the server. */}
      <FormItem
        name={fieldName("fk_kennziffer")}
        label={<FormLabel>Kennziffer</FormLabel>}
        className="mb-4"
        hidden={isCreation}
      >
        <Select
          placeholder={getPlaceholder(readOnly, "Kennziffer auswählen")}
          className="w-full"
          size="large"
          allowClear
          showSearch
          optionFilterProp="children"
        >
          {kennzifferOptions.map((item) => (
            <Select.Option key={item.id} value={item.id}>
              {item.kennziffer} - {item.beschreibung}
            </Select.Option>
          ))}
        </Select>
      </FormItem>

      {/* Laufende Nr. and Leuchtennummer. In the creation flow Laufende Nr.
          is set on the Standort tab — its field here is hidden (but still
          submitted), and Leuchtennummer takes the full width. */}
      {isCreation ? (
        <>
          <FormItem name={fieldName("lfd_nummer")} className="mb-4" hidden>
            <InputNumber className="w-full" size="large" />
          </FormItem>
          <FormItem
            name={fieldName("leuchtennummer")}
            label={<FormLabel>Leuchtennummer</FormLabel>}
            className="mb-4"
          >
            <InputNumber
              className="w-full"
              size="large"
              placeholder={getPlaceholder(readOnly, "Nummer eingeben")}
            />
          </FormItem>
        </>
      ) : (
        <Row gutter={16}>
          <Col span={12}>
            <FormItem
              name={fieldName("lfd_nummer")}
              label={<FormLabel>Laufende Nr.</FormLabel>}
              className="mb-4"
            >
              <InputNumber className="w-full" size="large" placeholder={getPlaceholder(readOnly, "Nummer eingeben")} />
            </FormItem>
          </Col>
          <Col span={12}>
            <FormItem
              name={fieldName("leuchtennummer")}
              label={<FormLabel>Leuchtennummer</FormLabel>}
              className="mb-4"
            >
              <InputNumber className="w-full" size="large" placeholder={getPlaceholder(readOnly, "Nummer eingeben")} />
            </FormItem>
          </Col>
        </Row>
      )}

      {/* Leuchtentyp */}
      <FormItem
        name={fieldName("fk_leuchttyp")}
        label={<FormLabel>Leuchtentyp</FormLabel>}
        className="mb-4"
      >
        <Select
          placeholder={getPlaceholder(readOnly, "Leuchtentyp auswählen")}
          className="w-full"
          size="large"
          allowClear
          showSearch
          optionFilterProp="children"
        >
          {leuchttypOptions.map((item) => (
            <Select.Option key={item.id} value={item.id}>
              {item.leuchtentyp} {item.fabrikat}
            </Select.Option>
          ))}
        </Select>
      </FormItem>

      {/* Inbetriebnahme and Zähler */}
      <Row gutter={16}>
        <Col span={12}>
          <FormItem
            name={fieldName("inbetriebnahme_leuchte")}
            label={<FormLabel>Inbetriebnahme</FormLabel>}
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
            name={fieldName("zaehler")}
            valuePropName="checked"
            className="mb-4 mt-8"
          >
            <Checkbox>Zähler vorhanden</Checkbox>
          </FormItem>
        </Col>
      </Row>

      {/* Montagefirma */}
      <FormItem
        name={fieldName("montagefirma_leuchte")}
        label={<FormLabel>Montagefirma</FormLabel>}
        className="mb-4"
      >
        <Input size="large" placeholder={getPlaceholder(readOnly, "Montagefirma eingeben")} />
      </FormItem>

      {/* Energielieferant */}
      <FormItem
        name={fieldName("fk_energielieferant")}
        label={<FormLabel>Energielieferant</FormLabel>}
        className="mb-4"
      >
        <Select
          placeholder={getPlaceholder(readOnly, "Energielieferant auswählen")}
          className="w-full"
          size="large"
          allowClear
          showSearch
          optionFilterProp="children"
        >
          {energielieferantOptions.map((item) => (
            <Select.Option key={item.id} value={item.id}>
              {item.energielieferant}
            </Select.Option>
          ))}
        </Select>
      </FormItem>

      {/* Schaltstelle */}
      <FormItem
        name={fieldName("schaltstelle")}
        label={<FormLabel>Schaltstelle</FormLabel>}
        className="mb-4"
      >
        <Input size="large" placeholder={getPlaceholder(readOnly, "Schaltstelle eingeben")} />
      </FormItem>

      {/* Rundsteuerempfänger */}
      <FormItem
        name={fieldName("rundsteuerempfaenger")}
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

      {/* Einbaudatum */}
      <FormItem
        name={fieldName("einbaudatum")}
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

      {/* Doppelkommando 1 */}
      <Row gutter={16}>
        <Col span={16}>
          <FormItem
            name={fieldName("fk_dk1")}
            label={<FormLabel>Doppelkommando 1</FormLabel>}
            className="mb-4"
          >
            <Select
              placeholder={getPlaceholder(readOnly, "Auswählen")}
              className="w-full"
              size="large"
              allowClear
              showSearch
              optionFilterProp="children"
            >
              {doppelkommandoOptions.map((item) => (
                <Select.Option key={item.id} value={item.id}>
                  {item.pk} - {item.beschreibung}
                </Select.Option>
              ))}
            </Select>
          </FormItem>
        </Col>
        <Col span={8}>
          <FormItem
            name={fieldName("anzahl_1dk")}
            label={<FormLabel>Anzahl</FormLabel>}
            className="mb-4"
          >
            <InputNumber className="w-full" size="large" placeholder={getPlaceholder(readOnly, "Anzahl eingeben")} />
          </FormItem>
        </Col>
      </Row>

      {/* Anschlussleistung 1 */}
      <FormItem
        name={fieldName("anschlussleistung_1dk")}
        label={<FormLabel>Anschlussleistung</FormLabel>}
        className="mb-4"
      >
        <InputNumber
          className="w-full"
          size="large"
          precision={2}
          decimalSeparator=","
          placeholder={getPlaceholder(readOnly, "Leistung eingeben")}
        />
      </FormItem>

      {/* Doppelkommando 2 */}
      <Row gutter={16}>
        <Col span={16}>
          <FormItem
            name={fieldName("fk_dk2")}
            label={<FormLabel>Doppelkommando 2</FormLabel>}
            className="mb-4"
          >
            <Select
              placeholder={getPlaceholder(readOnly, "Auswählen")}
              className="w-full"
              size="large"
              allowClear
              showSearch
              optionFilterProp="children"
            >
              {doppelkommandoOptions.map((item) => (
                <Select.Option key={item.id} value={item.id}>
                  {item.pk} - {item.beschreibung}
                </Select.Option>
              ))}
            </Select>
          </FormItem>
        </Col>
        <Col span={8}>
          <FormItem
            name={fieldName("anzahl_2dk")}
            label={<FormLabel>Anzahl</FormLabel>}
            className="mb-4"
          >
            <InputNumber className="w-full" size="large" placeholder={getPlaceholder(readOnly, "Anzahl eingeben")} />
          </FormItem>
        </Col>
      </Row>

      {/* Anschlussleistung 2 */}
      <FormItem
        name={fieldName("anschlussleistung_2dk")}
        label={<FormLabel>Anschlussleistung</FormLabel>}
        className="mb-4"
      >
        <InputNumber
          className="w-full"
          size="large"
          precision={2}
          decimalSeparator=","
          placeholder={getPlaceholder(readOnly, "Leistung eingeben")}
        />
      </FormItem>

      {/* Unterhalt Leuchte */}
      <FormItem
        name={fieldName("fk_unterhaltspflicht_leuchte")}
        label={<FormLabel>Unterhalt Leuchte</FormLabel>}
        className="mb-4"
      >
        <Select
          placeholder={getPlaceholder(readOnly, "Auswählen")}
          className="w-full"
          size="large"
          allowClear
          showSearch
          optionFilterProp="children"
        >
          {unterhaltLeuchteOptions.map((item) => (
            <Select.Option key={item.id} value={item.id}>
              {item.pk} - {item.unterhaltspflichtiger_leuchte}
            </Select.Option>
          ))}
        </Select>
      </FormItem>

      {/* Leuchtmittelwechsel / Nächster Wechsel */}
      <Row gutter={16}>
        <Col span={12}>
          <FormItem
            name={fieldName("wechseldatum")}
            label={<FormLabel>Leuchtmittelwechsel</FormLabel>}
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
            name={fieldName("naechster_wechsel")}
            label={<FormLabel>Nächster Wechsel</FormLabel>}
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

      {/* Leuchtmittel */}
      <FormItem
        name={fieldName("leuchtmittel")}
        label={<FormLabel>Leuchtmittel</FormLabel>}
        className="mb-4"
      >
        <Select
          placeholder={getPlaceholder(readOnly, "Leuchtmittel auswählen")}
          className="w-full"
          size="large"
          allowClear
          showSearch
          optionFilterProp="children"
        >
          {leuchtmittelOptions.map((item) => (
            <Select.Option key={item.id} value={item.id}>
              {item.hersteller} {item.lichtfarbe}
            </Select.Option>
          ))}
        </Select>
      </FormItem>

      {/* Lebensdauer */}
      <FormItem
        name={fieldName("lebensdauer")}
        label={<FormLabel>Lebensdauer</FormLabel>}
        className="mb-4"
      >
        <InputNumber
          className="w-full"
          size="large"
          precision={2}
          decimalSeparator=","
          placeholder={getPlaceholder(readOnly, "Stunden eingeben")}
        />
      </FormItem>

      {/* Sonderturnus */}
      <FormItem
        name={fieldName("sonderturnus")}
        label={<FormLabel>Sonderturnus</FormLabel>}
        className="mb-4"
      >
        <DatePicker
          className="w-full"
          size="large"
          format="DD.MM.YYYY"
          placeholder={getPlaceholder(readOnly, "Datum auswählen")}
        />
      </FormItem>

      {/* Vorschaltgerät */}
      <FormItem
        name={fieldName("vorschaltgeraet")}
        label={<FormLabel>Vorschaltgerät</FormLabel>}
        className="mb-4"
      >
        <Input size="large" placeholder={getPlaceholder(readOnly, "Vorschaltgerät eingeben")} />
      </FormItem>

      {/* Erneuerung VG */}
      <FormItem
        name={fieldName("wechselvorschaltgeraet")}
        label={<FormLabel>Erneuerung VG</FormLabel>}
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
        name={fieldName("bemerkungen")}
        label={<FormLabel>Bemerkung</FormLabel>}
        className="mb-4"
      >
        <Input.TextArea rows={4} size="large" placeholder={getPlaceholder(readOnly, "Bemerkung eingeben")} />
      </FormItem>
    </Form>
  );
};

export default LeuchteFormFields;
