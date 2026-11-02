import { formatSavedAt } from "./lockText";
import type { DetailRow } from "./LockDetails";
import type { DraftRecord } from "./draftStore";

// "Ihre Änderungen   Chrome: 2.11.2026, 14:37"
export const draftRow = (record: DraftRecord): DetailRow => ({
  key: "draft",
  label: "Ihre Änderungen",
  value: `${record.client}: ${formatSavedAt(record.savedAt)}`,
});
