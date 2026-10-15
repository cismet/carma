import { useCallback, useEffect, useState } from "react";
import { message } from "antd";
import { useDispatch, useSelector } from "react-redux";
import { REGISTRY } from "./fieldRegistry";
import type { ObjectType } from "./fieldRegistry";
import {
  applySavedSearch,
  getExpertTypeState,
  setSavedSearchId,
} from "../../../store/slices/expertSearch";
import { getJWT, getLogin } from "../../../store/slices/auth";
import {
  fetchGespeicherteSuchen,
  updateDataByClassName,
} from "../../../helper/apiMethods";
import type { GespeicherteSuche } from "../../../helper/apiMethods";
import {
  parseSavedSearchDefinition,
  toSavedSearchDefinition,
} from "./savedSearchUtils";

const CLASS_NAME = "gespeicherte_suche";

export interface SaveSearchInput {
  name: string;
  beschreibung?: string;
  overwrite: boolean;
}

// Data side of the saved expert searches for one tab. save/remove throw on
// failure; select returns null for an unreadable definition.
export const useSavedSearches = (objectType: ObjectType) => {
  const dispatch = useDispatch();
  const jwt = useSelector(getJWT) as string | undefined;
  const login = useSelector(getLogin) as string | undefined;
  const typeState = useSelector(getExpertTypeState(objectType));
  const savedSearchId = typeState.savedSearchId ?? null;

  const [items, setItems] = useState<GespeicherteSuche[]>([]);
  const [loading, setLoading] = useState(false);

  const reload = useCallback(async () => {
    if (!jwt) return;
    setLoading(true);
    try {
      setItems(await fetchGespeicherteSuchen(jwt, objectType));
    } catch (err: unknown) {
      console.error("[useSavedSearches] load failed:", err);
      void message.error("Gespeicherte Suchen konnten nicht geladen werden");
    } finally {
      setLoading(false);
    }
  }, [jwt, objectType]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const current = items.find((i) => i.id === savedSearchId) ?? null;

  const select = (id: number | undefined): { dropped: number } | null => {
    const item = id == null ? undefined : items.find((i) => i.id === id);
    if (!item) {
      dispatch(setSavedSearchId({ objectType, savedSearchId: null }));
      return { dropped: 0 };
    }
    const parsed = parseSavedSearchDefinition(
      item.definition,
      REGISTRY[objectType]
    );
    if (!parsed) return null;
    dispatch(
      applySavedSearch({
        objectType,
        savedSearchId: item.id,
        definition: parsed.definition,
      })
    );
    return { dropped: parsed.dropped };
  };

  const save = async ({ name, beschreibung, overwrite }: SaveSearchInput) => {
    if (!jwt) throw new Error("Not logged in");
    const target = overwrite ? current : null;
    const now = new Date().toISOString();
    const payload: Record<string, unknown> = {
      id: target ? target.id : -1,
      name: name.trim(),
      beschreibung: beschreibung?.trim() || null,
      objekttyp: objectType,
      definition: JSON.stringify(toSavedSearchDefinition(typeState)),
      geaendert_am: now,
    };
    if (!target) {
      payload.angelegt_von = login ?? null;
      payload.angelegt_am = now;
    }

    const result = (await updateDataByClassName(jwt, CLASS_NAME, payload)) as {
      res?: string;
    } | null;
    let id = target ? target.id : null;
    if (!target && result?.res) {
      const parsed = JSON.parse(result.res) as { id?: number | string };
      if (parsed.id != null) id = Number(parsed.id);
    }
    dispatch(setSavedSearchId({ objectType, savedSearchId: id }));
    await reload();
  };

  const remove = async (id: number) => {
    if (!jwt) return;
    await updateDataByClassName(jwt, CLASS_NAME, { id, is_deleted: true });
    if (id === savedSearchId) {
      dispatch(setSavedSearchId({ objectType, savedSearchId: null }));
    }
    await reload();
  };

  return { items, loading, current, select, save, remove };
};
