import { useMemo } from "react";
import { useSelector } from "react-redux";
import type { FormInstance } from "antd";
import { getKeyTablesData } from "../../../store/slices/keyTables";

export interface SensorbetreiberItem {
  id: number;
  key?: string;
  name?: string;
  beschreibung?: string;
}

/** Option label for the Sensorbetreiber select: the Beschreibung of the row. */
export const formatSensorbetreiber = (item: SensorbetreiberItem) =>
  item.beschreibung ?? item.name ?? String(item.id);

/**
 * Sensorbetreiber key-table options plus the id of esave.
 *
 * esave is currently the only Sensorbetreiber. It is resolved by key/name
 * rather than a hardcoded id so the lookup survives differing ids per
 * environment; a single-row table is taken as-is.
 */
export const useSensorbetreiber = () => {
  const keyTablesData = useSelector(getKeyTablesData);

  const options = useMemo(
    () =>
      [
        ...((keyTablesData.sensorbetreiber || []) as SensorbetreiberItem[]),
      ].sort((a, b) =>
        formatSensorbetreiber(a).localeCompare(formatSensorbetreiber(b), "de", {
          sensitivity: "base",
        })
      ),
    [keyTablesData.sensorbetreiber]
  );

  const esaveId = useMemo(() => {
    const match = options.find((item) =>
      [item.key, item.name].some(
        (value) =>
          typeof value === "string" && value.trim().toLowerCase() === "esave"
      )
    );
    if (match) return match.id;
    return options.length === 1 ? options[0].id : undefined;
  }, [options]);

  return { options, esaveId };
};

/**
 * Sensor-ID → Sensorbetreiber. Entering a Sensor-ID picks esave for the user
 * (the server sets it as a fallback, but this way the link is visible right
 * away); clearing the Sensor-ID drops the Betreiber again so the pair stays
 * consistent. Driven by the input's own onChange, not by a value watcher, so
 * loading a record that has a Sensor-ID but no Betreiber does not silently
 * dirty the form on open.
 */
export const syncSensorbetreiber = ({
  value,
  form,
  name,
  esaveId,
  notify,
}: {
  value: string;
  form: FormInstance;
  name: string | string[];
  esaveId?: number;
  notify?: (
    changedValues: Record<string, unknown>,
    allValues: Record<string, unknown>
  ) => void;
}) => {
  const hasSensorId = value.trim() !== "";
  const current = form.getFieldValue(name);
  if (hasSensorId && current == null && esaveId != null) {
    form.setFieldValue(name, esaveId);
    notify?.({ sensorbetreiber: esaveId }, form.getFieldsValue());
  } else if (!hasSensorId && current != null) {
    form.setFieldValue(name, null);
    notify?.({ sensorbetreiber: null }, form.getFieldsValue());
  }
};

/**
 * An emptied Sensor-ID must reach the server as null, not "". The empty string
 * lands in the numeric column as 0, which reads back as a set sensor — and
 * since the server assigns esave as a fallback for any non-null Sensor-ID, the
 * pair the user just cleared reappears as "0 / esave" after a reload. Clearing
 * the Sensor-ID therefore clears the Betreiber explicitly as well.
 */
export const normalizeSensorValues = <T extends Record<string, unknown>>(
  values: T
): T => {
  if (!("sensorid" in values)) return values;
  const raw = values.sensorid;
  const isEmpty = raw == null || (typeof raw === "string" && raw.trim() === "");
  if (!isEmpty) return values;
  return { ...values, sensorid: null, sensorbetreiber: null };
};
