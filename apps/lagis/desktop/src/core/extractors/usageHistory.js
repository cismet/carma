const parcelEnd = (landparcel) => {
  const end = landparcel?.flurstueck_schluessel?.gueltig_bis;
  return end ? new Date(end).getTime() : undefined;
};

const isOpenAt = (bis, end) =>
  bis === null || bis === undefined || new Date(bis).getTime() >= end;

export const usageHistoryDays = (landparcel) => {
  const end = parcelEnd(landparcel);
  const ends = (landparcel?.nutzungArrayRelationShip ?? [])
    .flatMap((nutzung) => nutzung.nutzung_buchungArrayRelationShip ?? [])
    .map((buchung) => buchung.gueltig_bis)
    .filter((bis) => bis && !isOpenAt(bis, end));
  const byDay = new Map();
  [...new Set(ends)]
    .sort((a, b) => new Date(a) - new Date(b))
    .forEach((bis) => {
      const day = bis.slice(0, 10);
      byDay.set(day, [...(byDay.get(day) ?? []), bis]);
    });
  return [...byDay].map(([day, times]) => ({ day, times }));
};

const sameDay = (a, b) => a.toDateString() === b.toDateString();

export const isCurrentBuchung = (buchung, landparcel) =>
  isOpenAt(buchung.gueltig_bis, parcelEnd(landparcel));

export const isBuchungAt = (buchung, moment, landparcel) => {
  if (!moment) {
    return isCurrentBuchung(buchung, landparcel);
  }
  if (!buchung.gueltig_von) {
    return false;
  }
  const at = new Date(moment);
  const von = new Date(buchung.gueltig_von);
  const bis = buchung.gueltig_bis ? new Date(buchung.gueltig_bis) : new Date();
  return (at > von || sameDay(at, von)) && at <= bis;
};
