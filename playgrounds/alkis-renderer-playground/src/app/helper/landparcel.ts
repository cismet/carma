import { NamesArr, Owners } from "../components/AdditionalSheet";

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

  return title;
};

export const getLandRegisterDistrict = (code: string): string | undefined => {
  const codeFirstNumber = code.split("-")[0] as keyof typeof districtNamesMap;
  const districtNamesMap: Record<string, string> = {
    "053001": "Barmen",
    "053485": "Beyenburg",
    "053279": "Cronenberg",
    "053278": "Dönberg",
    "053135": "Elberfeld",
    "051329": "Gennebreck",
    "051310": "Gevelsberg",
    "051330": "Haßlinghausen",
    "053486": "Langerfeld",
    "053263": "Lennep",
    "053264": "Lüttringhausen",
    "053487": "Nächstebreck",
    "053422": "Oberdüssel",
    "054241": "Radevormwald",
    "053267": "Ronsdorf",
    "051339": "Schwelm",
    "053276": "Schöller",
    "053277": "Vohwinkel",
  };

  const districtName = districtNamesMap[codeFirstNumber];
  return `${districtName} (${codeFirstNumber})`;
};

export const buildGroupedOwnersArr = (
  namesArr: NamesArr[],
  owners: Owners[]
): Owners[][] => {
  const uuidList = namesArr.map((n) => n.uuid);

  const uuidGroupsArr = namesArr
    .filter((n) => n.namensnummernUUIds)
    .map((n) => n.namensnummernUUIds)
    .flat();

  const removedDoubles = uuidList.filter(
    (uuid) => !uuidGroupsArr.includes(uuid)
  );

  const existingsUids = namesArr
    .filter((n) => removedDoubles.includes(n.uuid))
    .map((item) => {
      if (item.namensnummernUUIds) {
        return item.namensnummernUUIds;
      } else {
        return [item.uuid];
      }
    });

  let result: string[][] = [];

  existingsUids.forEach((innerArray) => {
    let res: string[] = [];
    innerArray.forEach((uuid) => {
      const matchingObject = namesArr.filter((obj) => obj.uuid === uuid);
      if (matchingObject) {
        const withOwnerId = matchingObject.map((n) => {
          if (n.eigentuemerUUId) {
            return n.eigentuemerUUId;
          } else {
            return "";
          }
        });
        res.push(withOwnerId[0]);
      }
    });

    result.push(res);
  });

  const ownerRes: Owners[][] = [];

  result.forEach((innerArray) => {
    let res: Owners[] = [];
    innerArray.forEach((uuid) => {
      const matchingObject = owners.filter((obj) => obj.ownerId === uuid);
      if (matchingObject) {
        res.push(matchingObject[0]);
      }
    });

    ownerRes.push(res);
  });

  return ownerRes;
};
