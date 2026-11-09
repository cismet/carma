import { createSelector, type Dispatch } from "@reduxjs/toolkit";
import {
  findHolder,
  formatLockInfo,
  isOwnLock,
  lockTimestamp,
  tabLockName,
} from "@carma-providers/locking";
import type { LockTarget } from "@carma-providers/locking";
import store from "../store";
import { getJWT, getLogin, getLoginFromJWT } from "../store/slices/auth";
import {
  discardDraft,
  getAllDrafts,
  isCreationDraftKey,
} from "../store/slices/featuresForms";
import {
  getAllAADrafts,
  getAllAPDrafts,
  getAPDeletions,
  discardAADraft,
  discardAPDraft,
} from "../store/slices/arbeitsauftraegeDrafts";
import {
  getHeldDraftLocks,
  isEditedInOtherTab,
  setHeldDraftLock,
} from "../store/slices/draftLocks";
import type { HeldDraftLock } from "../store/slices/draftLocks";
import { belisLockAdapter } from "./lockAdapter";

export interface DraftLockTarget extends LockTarget {
  label: string;
  updatedAt?: number;
}

// featureType of a draft → locked table
const FEATURE_TABLES: Record<string, { table: string; label: string }> = {
  leuchte: { table: "tdta_leuchten", label: "Leuchte" },
  standort: { table: "tdta_standort_mast", label: "Standort" },
  schaltstelle: { table: "schaltstelle", label: "Schaltstelle" },
  leitung: { table: "leitung", label: "Leitung" },
  mauerlasche: { table: "mauerlasche", label: "Mauerlasche" },
  abzweigdose: { table: "abzweigdose", label: "Abzweigdose" },
};

const FEATURE_PREFIX = "feature:";
const AA_PREFIX = "aa:";
const AP_PREFIX = "ap:";

export const featureLockKey = (featureId: string) =>
  `${FEATURE_PREFIX}${featureId}`;
export const aaLockKey = (id: string) => `${AA_PREFIX}${id}`;
export const apLockKey = (id: string) => `${AP_PREFIX}${id}`;

const toDbId = (value: unknown) => {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : undefined;
};

// Web Lock names, the same DraftLockGuard holds while a draft exists
const lockName = (type: string, value: unknown) => {
  const id = toDbId(value);
  return id ? tabLockName("belis", { type, id }) : undefined;
};
export const featureTabLockName = (
  formKey: string | undefined,
  id: unknown
) => {
  const table = formKey ? FEATURE_TABLES[formKey]?.table : undefined;
  return table ? lockName(table, id) : undefined;
};
export const aaTabLockName = (id: unknown) => lockName("arbeitsauftrag", id);
export const apTabLockName = (id: unknown) => lockName("arbeitsprotokoll", id);

// Every draft of an existing object needs a lock; new objects don't.
export const selectDraftLockTargets = createSelector(
  [getAllDrafts, getAllAADrafts, getAllAPDrafts, getAPDeletions],
  (drafts, aaDrafts, apDrafts, apDeletions) => {
    const targets: Record<string, DraftLockTarget> = {};
    for (const [featureId, draft] of Object.entries(drafts)) {
      const config = FEATURE_TABLES[draft.featureType];
      const id = toDbId(draft.featureDbId ?? featureId.split(":").pop());
      if (draft.isCreation || isCreationDraftKey(featureId) || !config || !id) {
        continue;
      }
      targets[featureLockKey(featureId)] = {
        type: config.table,
        id,
        label: `${config.label} ${String(id)}`,
        updatedAt: draft.updatedAt,
      };
    }
    for (const [aaId, draft] of Object.entries(aaDrafts)) {
      const id = toDbId(aaId);
      if (id) {
        targets[aaLockKey(aaId)] = {
          type: "arbeitsauftrag",
          id,
          label: `Arbeitsauftrag ${draft.meta?.nummer ?? aaId}`,
          updatedAt: draft.updatedAt,
        };
      }
    }
    for (const apId of [
      ...Object.keys(apDrafts),
      ...Object.keys(apDeletions),
    ]) {
      const id = toDbId(apId);
      if (id) {
        targets[apLockKey(apId)] = {
          type: "arbeitsprotokoll",
          id,
          label: `Arbeitsprotokoll ${apId}`,
          updatedAt: apDrafts[apId]?.updatedAt,
        };
      }
    }
    return targets;
  }
);

// for a lock conflict or a refused take-over
export const dropLockedDraft = (dispatch: Dispatch, key: string) => {
  if (key.startsWith(FEATURE_PREFIX)) {
    dispatch(discardDraft(key.slice(FEATURE_PREFIX.length)));
  } else if (key.startsWith(AA_PREFIX)) {
    dispatch(discardAADraft(key.slice(AA_PREFIX.length)));
  } else if (key.startsWith(AP_PREFIX)) {
    dispatch(discardAPDraft(key.slice(AP_PREFIX.length)));
  }
};

export const currentLockUser = () => {
  const state = store.getState();
  const jwt = getJWT(state) as string | undefined;
  return ((getLogin(state) as string | undefined) ??
    (jwt ? (getLoginFromJWT(jwt) as string | undefined) : undefined) ??
    "") as string;
};

export const OTHER_TAB_MESSAGE =
  "Wird in einem anderen Tab bearbeitet. Bitte dort speichern oder den Tab schließen.";

// Checked right before saving: undefined when the draft's lock is still the
// newest row, otherwise the reason the save is refused.
export const draftLockError = async (
  jwt: string,
  key: string
): Promise<string | undefined> => {
  if (isEditedInOtherTab(store.getState(), key)) {
    return OTHER_TAB_MESSAGE;
  }
  const held = getHeldDraftLocks(store.getState())[key];
  if (!held) {
    return "Das Objekt ist nicht gesperrt. Bitte die Bearbeitung neu beginnen.";
  }
  try {
    const holder = await findHolder(belisLockAdapter(jwt), held);
    if (holder?.id === held.lockId) {
      return undefined;
    }
    return holder && !isOwnLock(holder, currentLockUser())
      ? `${held.label} wird von ${holder.userString} bearbeitet.`
      : `Ihre Sperre für ${held.label} besteht nicht mehr.`;
  } catch (error) {
    console.error("Sperre konnte nicht geprüft werden", error);
    return "Die Sperre konnte nicht geprüft werden. Bitte erneut versuchen.";
  }
};

// BelIS names the app, not the browser, next to "Java-Anwendung"
export const WEB_CLIENT = "Web-Anwendung";

// Server actions refuse locked objects, our own lock included.
export const unlockForActions = async (
  jwt: string,
  key: string
): Promise<HeldDraftLock | undefined> => {
  const held = getHeldDraftLocks(store.getState())[key];
  if (held) {
    await belisLockAdapter(jwt).remove(held.lockId);
  }
  return held;
};

export const relockAfterActions = async (
  jwt: string,
  key: string,
  held: HeldDraftLock
) => {
  const lockId = await belisLockAdapter(jwt).write(
    { type: held.type, id: held.id },
    currentLockUser(),
    formatLockInfo({
      context: held.label,
      object: "-",
      time: lockTimestamp(),
      client: WEB_CLIENT,
    })
  );
  store.dispatch(setHeldDraftLock({ key, lock: { ...held, lockId } }));
};
