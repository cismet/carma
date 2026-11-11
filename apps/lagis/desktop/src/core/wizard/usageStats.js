import { gesamtpreis } from "./usageData";

const NONE = "none";

const sum = (rows, valueOf) =>
  rows.reduce((total, row) => total + (valueOf(row) ?? 0), 0);

const totalsOf = (rows) => ({
  count: rows.length,
  flaeche: sum(rows, (row) => row.flaeche),
  wert: sum(rows, gesamtpreis),
});

const groupByKlasse = (rows) => {
  const groups = new Map();
  for (const row of rows) {
    const id = row.anlageklasseId ?? NONE;
    groups.set(id, [...(groups.get(id) ?? []), row]);
  }
  return groups;
};

const diff = (before, after) => ({
  count: after.count - before.count,
  flaeche: after.flaeche - before.flaeche,
  wert: after.wert - before.wert,
});

// rounding noise from typed decimals must not count as a change; the row
// count is left out because a split spreads one row over several parcels
const EPSILON = 0.005;
const isChanged = (delta) =>
  Math.abs(delta.flaeche) > EPSILON || Math.abs(delta.wert) > EPSILON;

// before: the consumed parcel's Nutzungen; after: all new parcels together
export const splitUsageStats = (sourceUsage, usage) => {
  const afterRows = Object.values(usage ?? {}).flat();
  const before = groupByKlasse(sourceUsage ?? []);
  const after = groupByKlasse(afterRows);
  const ids = [...new Set([...before.keys(), ...after.keys()])];

  const klassen = ids.map((id) => {
    const b = totalsOf(before.get(id) ?? []);
    const a = totalsOf(after.get(id) ?? []);
    const delta = diff(b, a);
    return {
      anlageklasseId: id === NONE ? undefined : id,
      before: b,
      after: a,
      delta,
      changed: isChanged(delta),
    };
  });

  const totalBefore = totalsOf(sourceUsage ?? []);
  const totalAfter = totalsOf(afterRows);
  const delta = diff(totalBefore, totalAfter);
  return {
    klassen,
    total: {
      before: totalBefore,
      after: totalAfter,
      delta,
      changed: isChanged(delta),
    },
    perParcel: Object.entries(usage ?? {}).map(([label, rows]) => ({
      label,
      ...totalsOf(rows),
    })),
  };
};
