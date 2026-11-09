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

export const isBuchungAt = (buchung, moment) => {
  if (!moment) {
    return buchung.gueltig_bis === null;
  }
  const at = new Date(moment);
  return (
    new Date(buchung.gueltig_von) < at &&
    (buchung.gueltig_bis === null || at <= new Date(buchung.gueltig_bis))
  );
};
