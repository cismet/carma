export const getLandparcelTitle = (
  alkisId,
  flur,
  fstck_nenner,
  fstck_zaehler
) => {
  const gemarkung = alkisId.split("-")[0];
  const nenner = parseInt(fstck_nenner, 10);
  const zaehler = parseInt(fstck_zaehler, 10);
  const fullFstck = nenner ? `${zaehler}/${nenner}` : zaehler;
  const title = `Flurstück ${fullFstck} - Flur ${flur} - Gemarkung ${gemarkung}`;

  return title;
};

export const buildGroupedOwnersArr = (namesArr, owners) => {
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

  let result = [];

  existingsUids.forEach((innerArray) => {
    let res = [];
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

  const ownerRes = [];

  result.forEach((innerArray) => {
    let res = [];
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
