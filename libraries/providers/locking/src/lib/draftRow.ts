import { formatSavedAt } from "./lockText";
import type { DetailRow } from "./LockDetails";
import type { DraftRecord } from "./draftStore";

// "Zuletzt geändert   Chrome: 2.11.2026, 14:37"
export const draftRow = (record: DraftRecord): DetailRow => ({
  key: "draft",
  label: "Zuletzt geändert",
  value: `${record.client}: ${formatSavedAt(record.savedAt)}`,
});
