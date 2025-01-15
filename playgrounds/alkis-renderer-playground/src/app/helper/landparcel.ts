export const getLandparcelTitle = (
  alkisId: string,
  flur: string,
  fstck_nenner: string,
  fstck_zaehler: string
) => {
  const gemarkung = alkisId.split("-")[0];
  const nenner = parseInt(fstck_nenner, 10);
  const zaehler = parseInt(fstck_zaehler, 10);
  const fullFstck = nenner ? `${zaehler}/${nenner}` : zaehler;
  const title = `Flurstück ${fullFstck} - Flur ${flur} - Gemarkung ${gemarkung}`;
  console.log("xxx title", title);
  return title;
};
