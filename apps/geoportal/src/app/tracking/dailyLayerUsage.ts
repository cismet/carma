import md5 from "md5";

/**
 * Remembers which layers this browser has already been counted for today.
 *
 * The "täglich genutzt" event answers how many people had a layer on their map
 * on a given day. Someone who opens the geoportal three times with the same
 * saved layers is one user of those layers, not three - so each layer is
 * reported at most once per calendar day.
 *
 * localStorage is what survives a closed tab. The app already persists its
 * layer stack locally (redux-persist on localForage), so this introduces no new
 * kind of client storage. Where it is unavailable - private windows, blocked
 * site data - the in-memory fallback still prevents duplicates within the
 * running session.
 *
 * Nothing is written in the clear: the day and every layer id are stored as an
 * md5 digest, and each id is hashed together with the day, so the same layer
 * looks different tomorrow. Note what this is and is not - the layer catalogue
 * is public and small, so the digests can be reversed by computing the few
 * hundred candidates. It keeps the record from being readable at a glance, it
 * does not make it secret.
 */

const STORAGE_KEY = "geoportal.tracking.dailyLayerUsage";

/** `d` is the hashed day, `ids` are the hashed day-and-layer pairs. */
type DailyRecord = { d: string; ids: string[] };

/** Local calendar day, so "today" matches the day the visitor experiences. */
const getToday = (): string => {
  const now = new Date();
  const month = `${now.getMonth() + 1}`.padStart(2, "0");
  const day = `${now.getDate()}`.padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
};

const hashDay = (day: string): string => md5(day);
const hashLayer = (day: string, id: string): string => md5(`${day}:${id}`);

let memoryFallback: DailyRecord = { d: hashDay(getToday()), ids: [] };

const read = (): DailyRecord => {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as DailyRecord;
      if (parsed && typeof parsed.d === "string" && Array.isArray(parsed.ids)) {
        return parsed;
      }
    }
  } catch {
    // unreadable storage - the in-memory record is the best we have
  }
  return memoryFallback;
};

const write = (record: DailyRecord) => {
  memoryFallback = record;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(record));
  } catch {
    // unwritable storage - dedup degrades to the running session
  }
};

/**
 * Claims today's slot for a layer: true the first time it is asked for on a
 * given day, false afterwards. Marking happens on the way out, so only ask
 * when the event is actually about to be sent.
 */
export const claimDailyLayerUsage = (id: string): boolean => {
  const today = getToday();
  const day = hashDay(today);
  const record = read();
  const ids = record.d === day ? record.ids : [];
  const entry = hashLayer(today, id);

  if (ids.includes(entry)) {
    return false;
  }

  write({ d: day, ids: [...ids, entry] });
  return true;
};

/** Test seam: drops what has been counted so far. */
export const resetDailyLayerUsage = () => {
  memoryFallback = { d: hashDay(getToday()), ids: [] };
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // nothing to clean up
  }
};
