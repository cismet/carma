import dayjs from "dayjs";
import type { Aenderung } from "../../../../store/slices/arbeitsauftraegeDrafts";
import { applyTemplate } from "./aktionFieldConfig";
import type { AktionDefinition, AktionFormValues } from "./aktionFieldConfig";

type KeyTablesData = Record<string, Record<string, unknown>[]>;

const formatDate = (value: unknown): string | null => {
  if (!value) return null;
  if (dayjs.isDayjs(value)) return value.format("DD.MM.YYYY");
  const d = dayjs(value as string | number);
  return d.isValid() ? d.format("DD.MM.YYYY") : null;
};

const formatSelectValue = (
  value: unknown,
  keyTableName: string,
  template: string,
  keyTablesData: KeyTablesData,
): string | null => {
  if (value == null) return null;
  // value is an object (old data from server)
  if (typeof value === "object" && !Array.isArray(value)) {
    return applyTemplate(template, value as Record<string, unknown>) || null;
  }
  // value is an ID (new data from form)
  const options = keyTablesData[keyTableName] ?? [];
  const found = options.find((o) => o.id === value);
  return found ? applyTemplate(template, found) : String(value);
};

/**
 * Compute Änderungen (old → new) for a submitted action.
 *
 * @param definition  The action definition from aktionFieldConfig
 * @param formValues  Values submitted from the action modal
 * @param fachobjektData  Current fachobjekt data (e.g. data.tdta_leuchten)
 * @param keyTablesData  Key table lookup data from Redux
 */
export const computeAenderungen = (
  definition: AktionDefinition,
  formValues: AktionFormValues,
  fachobjektData: Record<string, unknown> | null,
  keyTablesData: KeyTablesData,
): Aenderung[] => {
  const aenderungen: Aenderung[] = [];
  const obj = fachobjektData ?? {};

  for (const field of definition.fields) {
    switch (field.type) {
      case "date-select": {
        // Date part
        const newDate = formValues[field.name];
        if (newDate != null) {
          const oldDate = obj[field.name];
          aenderungen.push({
            field: field.label,
            alt: formatDate(oldDate),
            neu: formatDate(newDate) ?? "",
          });
        }
        // Select part (if keyTableName is set, form field is `${name}_select`)
        if (field.keyTableName && field.optionTemplate) {
          const selectKey = `${field.name}_select`;
          const newVal = formValues[selectKey];
          if (newVal != null) {
            const oldVal = obj[field.name];
            aenderungen.push({
              field: field.label,
              alt: formatSelectValue(
                oldVal,
                field.keyTableName,
                field.optionTemplate,
                keyTablesData,
              ),
              neu:
                formatSelectValue(
                  newVal,
                  field.keyTableName,
                  field.optionTemplate,
                  keyTablesData,
                ) ?? "",
            });
          }
        }
        break;
      }

      case "date": {
        const newDate = formValues[field.name];
        if (newDate != null) {
          const oldDate = obj[field.name];
          aenderungen.push({
            field: field.label,
            alt: formatDate(oldDate),
            neu: formatDate(newDate) ?? "",
          });
        }
        break;
      }

      case "select": {
        const newVal = formValues[field.name];
        if (newVal != null) {
          const oldVal = obj[field.name];
          aenderungen.push({
            field: field.label,
            alt: formatSelectValue(
              oldVal,
              field.keyTableName,
              field.optionTemplate,
              keyTablesData,
            ),
            neu:
              formatSelectValue(
                newVal,
                field.keyTableName,
                field.optionTemplate,
                keyTablesData,
              ) ?? "",
          });
        }
        break;
      }

      case "text":
      case "textarea": {
        const newVal = formValues[field.name];
        if (newVal != null && newVal !== "") {
          const oldVal = obj[field.name];
          aenderungen.push({
            field: field.label,
            alt: oldVal != null ? String(oldVal) : null,
            neu: String(newVal),
          });
        }
        break;
      }

      case "checkbox": {
        const newVal = formValues[field.name];
        if (newVal != null) {
          const oldVal = obj[field.name];
          aenderungen.push({
            field: field.checkboxLabel ?? field.label,
            alt: oldVal != null ? (oldVal ? "ja" : "nein") : null,
            neu: newVal ? "ja" : "nein",
          });
        }
        break;
      }
    }
  }

  return aenderungen;
};
