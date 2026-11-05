import {
  isJavaLock,
  parseLockInfo,
  toHeldLock,
} from "@carma-providers/locking";
import type { Lock, LockListItem } from "@carma-providers/locking";
import { ENDPOINT } from "../../constants/belis";
import { listAllLocks, lockClassId } from "../../helper/lockAdapter";
import { extractListItem } from "../ui/BelisSidebar";

type Row = Record<string, unknown> & { id: number | string };

interface TitleSource {
  table: string;
  fields: string;
  title: (row: Row) => string;
}

const main = (layerKey: string, properties: Record<string, unknown>) =>
  extractListItem(layerKey, { id: properties.id, properties }).main;

// same titles as the sticky form headers, without subtitle
const SOURCES: TitleSource[] = [
  {
    table: "tdta_leuchten",
    fields: "id leuchtennummer lfd_nummer tkey_leuchtentyp { leuchtentyp }",
    title: (row) =>
      `Leuchte ${main("leuchten", {
        ...row,
        leuchtentyp: (row.tkey_leuchtentyp as Row | null)?.leuchtentyp,
      })}`,
  },
  {
    table: "tdta_standort_mast",
    fields: "id lfd_nummer",
    title: (row) => main("standorte", row),
  },
  {
    table: "schaltstelle",
    fields: "id schaltstellen_nummer",
    title: (row) => `Schaltstelle ${main("schaltstelle", row)}`,
  },
  {
    table: "leitung",
    fields: "id",
    title: (row) => `Leitung ${main("leitungen", row)}`,
  },
  {
    table: "mauerlasche",
    fields: "id laufende_nummer",
    title: (row) => `Mauerlasche ${main("mauerlaschen", row)}`,
  },
  {
    table: "abzweigdose",
    fields: "id",
    title: (row) => `Abzweigdose / Zugkasten ${main("abzweigdose", row)}`,
  },
  {
    table: "arbeitsauftrag",
    fields: "id nummer",
    // the header shows the number only as subtitle
    title: (row) =>
      row.nummer ? `Arbeitsauftrag AA-${String(row.nummer)}` : "Arbeitsauftrag",
  },
  {
    table: "arbeitsprotokoll",
    fields: "id protokollnummer",
    title: (row) => `Protokoll #${String(row.protokollnummer ?? "")}`,
  },
];

const loadTitles = async (
  jwt: string,
  wanted: { source: TitleSource; ids: number[] }[]
) => {
  const titles = new Map<string, string>();
  if (!wanted.length) return titles;
  const query = `query {
${wanted
  .map(
    ({ source, ids }) =>
      `  ${source.table}(where: {id: {_in: [${ids.join(",")}]}}) { ${
        source.fields
      } }`
  )
  .join("\n")}
}`;
  const response = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${jwt}`,
    },
    body: JSON.stringify({ query }),
  });
  if (!response.ok) {
    throw new Error(`lock titles failed: ${String(response.status)}`);
  }
  const json = (await response.json()) as {
    data?: Record<string, Row[] | null>;
  };
  for (const { source } of wanted) {
    for (const row of json.data?.[source.table] ?? []) {
      titles.set(`${source.table}-${String(row.id)}`, source.title(row));
    }
  }
  return titles;
};

export const ROW_KEY_PREFIX = "sperre-";

// object keys are "sperre-<row>:<class>-<object>"
export const rowIdOf = (item: LockListItem) =>
  item.key.startsWith(ROW_KEY_PREFIX) && !item.key.includes(":")
    ? Number(item.key.slice(ROW_KEY_PREFIX.length))
    : undefined;

export const findAllLockItems = async (
  jwt: string
): Promise<LockListItem[]> => {
  const rows = await listAllLocks(jwt);
  const entities = rows.flatMap((row) => row.entities);
  const tableById = new Map<number, string>();
  await Promise.all(
    SOURCES.map(async ({ table }) => {
      try {
        tableById.set(await lockClassId(table), table);
      } catch {
        // unknown class: shown with its class id
      }
    })
  );

  const wanted = SOURCES.map((source) => ({
    source,
    ids: [
      ...new Set(
        entities
          .filter((lock) => tableById.get(lock.classId) === source.table)
          .map((lock) => lock.objectId)
      ),
    ],
  })).filter(({ ids }) => ids.length);

  let titles = new Map<string, string>();
  try {
    titles = await loadTitles(jwt, wanted);
  } catch (error) {
    console.warn("Could not load lock titles", error);
  }

  const titleOf = (classId: number, objectId: number) => {
    const table = tableById.get(classId);
    return (
      (table && titles.get(`${table}-${String(objectId)}`)) ??
      `${table ?? `Klasse ${String(classId)}`} ${String(objectId)}`
    );
  };

  return rows.flatMap((row) => {
    const rowKey = `${ROW_KEY_PREFIX}${String(row.id)}`;
    // Java rows are shown nested, web locks one card per object
    const javaRow = isJavaLock(row);
    const byObject = new Map<string, Lock[]>();
    for (const lock of row.entities) {
      const key = `${String(lock.classId)}-${String(lock.objectId)}`;
      byObject.set(key, [...(byObject.get(key) ?? []), lock]);
    }
    const children = [...byObject].flatMap(([key, locks]) => {
      const lock = toHeldLock(locks);
      const [classId, objectId] = key.split("-").map(Number);
      return lock && classId !== undefined && objectId !== undefined
        ? [
            {
              key: `${rowKey}:${key}`,
              objectLabel: titleOf(classId, objectId),
              lock,
              ...(javaRow ? { parentKey: rowKey } : {}),
            },
          ]
        : [];
    });
    if (!javaRow) {
      return children;
    }
    return [
      {
        key: rowKey,
        objectLabel:
          parseLockInfo(row.info)?.context || `Sperre ${String(row.id)}`,
        lock: { ...row, history: [] },
      },
      ...children,
    ];
  });
};
