export const usageHistoryDays = (landparcel) => {
  const ends = (landparcel?.nutzungArrayRelationShip ?? [])
    .flatMap((nutzung) => nutzung.nutzung_buchungArrayRelationShip ?? [])
    .map((buchung) => buchung.gueltig_bis)
    .filter(Boolean);
  const byDay = new Map();
  [...new Set(ends)]
    .sort((a, b) => new Date(a) - new Date(b))
    .forEach((end) => {
      const day = end.slice(0, 10);
      byDay.set(day, [...(byDay.get(day) ?? []), end]);
    });
  return [...byDay].map(([day, times]) => ({ day, times }));
};

const sameDay = (a, b) => a.toDateString() === b.toDateString();

export const isBuchungAt = (buchung, moment) => {
  if (!moment) {
    return buchung.gueltig_bis === null;
  }
  if (!buchung.gueltig_von) {
    return false;
  }
  const at = new Date(moment);
  const von = new Date(buchung.gueltig_von);
  const bis = buchung.gueltig_bis ? new Date(buchung.gueltig_bis) : new Date();
  return (at > von || sameDay(at, von)) && at <= bis;
};
