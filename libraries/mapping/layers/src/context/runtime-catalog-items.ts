import { useSyncExternalStore } from "react";
import type { Item } from "../lib/contracts/carma-layers.d";

export type RuntimeCatalogItem = {
  categoryId: string;
  item: Item;
  activate: () => void | Promise<void>;
};
let items: readonly RuntimeCatalogItem[] = [];
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((listener) => listener());
const snapshot = () => items;
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
/** Local assets use the ordinary catalogue cards without becoming map layers. */
export const registerRuntimeCatalogItems = (
  entries: readonly RuntimeCatalogItem[]
) => {
  items = [
    ...items.filter(
      (existing) => !entries.some((entry) => entry.item.id === existing.item.id)
    ),
    ...entries,
  ];
  notify();
  return () => {
    items = items.filter((entry) => !entries.includes(entry));
    notify();
  };
};
export const useRuntimeCatalogItems = () =>
  useSyncExternalStore(subscribe, snapshot, snapshot);
export const findRuntimeCatalogItem = (id: string) =>
  items.find((entry) => entry.item.id === id || `fav_${entry.item.id}` === id);
export const mergeRuntimeCategoryConfigs = <
  T extends { Title?: string; layers?: Item[] }
>(
  configs: Partial<Record<string, T[]>>,
  entries: readonly RuntimeCatalogItem[]
) => {
  const result: Partial<
    Record<string, (T | { Title: string; layers: Item[] })[]>
  > = { ...configs };
  const groups = new Map<
    string,
    { categoryId: string; Title: string; layers: Item[] }
  >();
  for (const entry of entries) {
    const Title = entry.item.path ?? "Lokale Dateien";
    const key = JSON.stringify([entry.categoryId, Title]);
    const group = groups.get(key) ?? {
      categoryId: entry.categoryId,
      Title,
      layers: [],
    };
    group.layers.push(entry.item);
    groups.set(key, group);
  }
  for (const { categoryId, Title, layers } of groups.values()) {
    result[categoryId] = [...(result[categoryId] ?? []), { Title, layers }];
  }
  return result;
};
