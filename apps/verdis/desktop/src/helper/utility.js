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

export const getLandRegisterDistrict = (code) => {
  const codeFirstNumber = code.split("-")[0];
  const districtNamesMap = {
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

export const getAdditionalTextForBooking = (newInfos, bookingType) => {
  const number = newInfos.number;
  const fratcion = newInfos.fraction;
  const bookingTypeLandparcel = newInfos.buchungsart;

  let newText = "";

  if (
    bookingTypeLandparcel &&
    (bookingTypeLandparcel !== bookingType || fratcion || number)
  ) {
    newText += ` (`;

    if (bookingTypeLandparcel && bookingTypeLandparcel !== bookingType) {
      newText += `${bookingTypeLandparcel}, `;
    }

    if (fratcion) {
      newText += "Anteil " + fratcion;
    }

    if (number) {
      newText += ", ATP Nr. " + number;
    }

    newText += `)`;
  }

  return newText;
};

export const getBookingByLandparcelCode = (landparcelcode, buchungsstellen) => {
  const booking = buchungsstellen.filter((b) => {
    if (!b.buchungsstellen) {
      return false;
    } else {
      return (
        b?.buchungsstellen[0]?.landParcel[0]?.landParcelCode === landparcelcode
      );
    }
  });

  return booking;
};
