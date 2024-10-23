const createItemsDictionary = (items) => {
  const allStandorteInRouten = [];
  const allZwischenstoppsInRouten = [];
  const allPoisInRouten = [];
  const standorteInRouten = {};
  const zwischenstoppsInRouten = {};
  const poisInRouten = {};

  const stationenInRouten = {};
  const angeboteInStandorte = {};
  const routen = {};
  const angebote = {};
  const zwischenstopps = {};
  const pois = {};
  const aussichtspunkte = {};

  //combined run
  // save all standortids in angeboteInStandorte
  // save all ort.id's that are in routen

  let additionalSelectableItemsCount = 0;

  for (const item of items) {
    if (item.typ === "route") {
      //
      const routenId = item.id;
      //orte in routen

      for (const ort of item.routenpunkte) {
        if (ort.typ === "klimaort") {
          allStandorteInRouten.push(ort.id);
          const currentStandortInCache = standorteInRouten[routenId];
          ort.enhanced = true;
          if (currentStandortInCache) {
            currentStandortInCache.push({ typ: "standort", id: ort.id });
          } else {
            standorteInRouten[routenId] = [{ typ: "standort", id: ort.id }];
          }
        } else if (ort.typ === "aussichtspunkt") {
          additionalSelectableItemsCount++;
          aussichtspunkte[ort.id] = ort;
          const currentStandortInCache = standorteInRouten[routenId];

          if (currentStandortInCache) {
            currentStandortInCache.push({ typ: "aussichtspunkt", id: ort.id });
          } else {
            standorteInRouten[routenId] = [
              { typ: "aussichtspunkt", id: ort.id },
            ];
          }

          //add routen subobject to aussichtspunkt
          if (ort.routen) {
            if (ort.routen.filter((r) => r.id === routenId).length === -1) {
              ort.routen.push({ id: routenId, typ: "route", name: item.name });
            }
          } else {
            ort.routen = [{ id: routenId, typ: "route", name: item.name }];
          }
          for (const aussichtspunktort of ort.klimaorte) {
            allStandorteInRouten.push(aussichtspunktort.id);
            const currentStandortInCache = standorteInRouten[routenId];
            if (currentStandortInCache) {
              currentStandortInCache.push({
                typ: "standort",
                id: aussichtspunktort.id,
              });
            } else {
              standorteInRouten[routenId] = [
                { typ: "standort", id: aussichtspunktort.id },
              ];
            }
          }
        } else if (ort.typ === "zwischenstopp") {
          allZwischenstoppsInRouten.push(ort.id);
          const currentZwischenstopInCache = zwischenstoppsInRouten[routenId];
          if (currentZwischenstopInCache) {
            currentZwischenstopInCache.push({
              typ: "zwischenstopp",
              id: ort.id,
            });
          } else {
            zwischenstoppsInRouten[routenId] = [
              { typ: "zwischenstopp", id: ort.id },
            ];
          }
        } else if (ort.typ === "poi") {
          allPoisInRouten.push(ort.id);
          const currentPoiInCache = poisInRouten[routenId];
          if (currentPoiInCache) {
            poisInRouten[routenId].push({ typ: "poi", id: ort.id });
          } else {
            poisInRouten[routenId] = [{ typ: "poi", id: ort.id }];
          }
        }
      }
      routen[routenId] = item;
    } else if (item.typ === "ort") {
      angebote[item.id] = item;
      const currentStandortInCache = angeboteInStandorte[item.standort.id];
      if (currentStandortInCache) {
        currentStandortInCache.push(item.id);
      } else {
        angeboteInStandorte[item.standort.id] = [item.id];
      }
    } else if (item.typ === "zwischenstopp") {
      zwischenstopps[item.id] = item;
    } else if (item.typ === "poi") {
      pois[item.id] = item;
    }
  }

  for (const route of Object.values(routen)) {
    //add routen subobject to angebote
    for (const standortInRoute of standorteInRouten[route.id]) {
      if (standortInRoute.typ === "standort") {
        const standortId = standortInRoute.id;
        for (const angebotId of angeboteInStandorte[standortId] || []) {
          const angebot = angebote[angebotId];
          if (angebot.routen) {
            if (angebot.routen.filter((r) => r.id === route.id).length === 0) {
              angebot.routen.push({
                id: route.id,
                typ: "route",
                name: route.name,
              });
            }
          } else {
            angebot.routen = [{ id: route.id, typ: "route", name: route.name }];
          }
        }
      }
    }

    // add routen subobject to zwischenstopps
    for (const zwischenstoppInRoute of zwischenstoppsInRouten[route.id] || []) {
      if (zwischenstoppInRoute.typ === "zwischenstopp") {
        const zwischenstoppId = zwischenstoppInRoute.id;

        const zwischenstopp = zwischenstopps[zwischenstoppId];
        if (zwischenstopp.routen) {
          if (
            zwischenstopp.routen.filter((r) => r.id === route.id).length === 0
          ) {
            zwischenstopp.routen.push({
              id: route.id,
              typ: "route",
              name: route.name,
            });
          }
        } else {
          zwischenstopp.routen = [
            { id: route.id, typ: "route", name: route.name },
          ];
        }
      }
    }

    // add routen subobject to pois
    for (const poiInRoute of poisInRouten[route.id] || []) {
      if (poiInRoute.typ === "poi") {
        const poiId = poiInRoute.id;

        const poi = pois[poiId];
        if (poi.routen) {
          if (poi.routen.filter((r) => r.id === route.id).length === 0) {
            poi.routen.push({ id: route.id, typ: "route", name: route.name });
          }
        } else {
          poi.routen = [{ id: route.id, typ: "route", name: route.name }];
        }
      }
    }
  }

  //add stationen to stationenInRouten
  // stationen define as angebote, pois, zwischenstopps ansd aussichtspunkte
  for (const routenId of Object.keys(routen)) {
    stationenInRouten[routenId] = [];

    const route = routen[routenId];

    for (const station of route.routenpunkte) {
      if (station.typ === "klimaort") {
        const standortId = station.id;
        if (!angeboteInStandorte[standortId]) {
          console.warn(
            "attention!!! angeboteInStandorte[standortId]===undefined",
            {
              "angeboteInStandorte[standortId]":
                angeboteInStandorte[standortId],
              angeboteInStandorte,
              standortId,
            }
          );
        }

        for (const angebotId of angeboteInStandorte[standortId] || []) {
          stationenInRouten[routenId].push({
            typ: "angebot",
            id: angebotId,
          });
        }
      } else if (station.typ === "aussichtspunkt") {
        //add the aussichtspunkt itself
        stationenInRouten[routenId].push({
          typ: station.typ,
          id: station.id,
        });
        //add the angebote of the aussichtspunkt vi the standorte
        const aussichtspunkt = aussichtspunkte[station.id];
        for (const klimaort of aussichtspunkt.klimaorte) {
          for (const angebotId of angeboteInStandorte[klimaort.id] || []) {
            stationenInRouten[routenId].push({
              typ: "angebot", // via Aussichtspunkt
              id: angebotId,
            });
          }
        }
      } else {
        stationenInRouten[routenId].push({
          typ: station.typ,
          id: station.id,
        });
      }
    }
  }

  //add angebote to aussichtspunkte
  for (const aussichtspunktid of Object.keys(aussichtspunkte)) {
    const aussichtspunkt = aussichtspunkte[aussichtspunktid];
    aussichtspunkt.angebote = [];
    for (const klimaort of aussichtspunkt.klimaorte) {
      aussichtspunkt.angebote.push(...angeboteInStandorte[klimaort.id]);
    }
  }

  const dict = {
    items,
    allStandorteInRouten,
    allZwischenstoppsInRouten,
    allPoisInRouten,
    standorteInRouten,
    angeboteInStandorte,
    stationenInRouten,
    angebote,
    routen,
    pois,
    zwischenstopps,
    additionalSelectableItemsCount,
    aussichtspunkte,
    zwischenstoppsInRouten,
    poisInRouten,
  };
  // console.log("yyy dictionary", dict);

  return dict;
};

export default createItemsDictionary;
