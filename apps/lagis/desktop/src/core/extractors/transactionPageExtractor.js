import { nanoid } from "@reduxjs/toolkit";
import dayjs from "dayjs";
import weekday from "dayjs/plugin/weekday";
import localeData from "dayjs/plugin/localeData";
import customParseFormat from "dayjs/plugin/customParseFormat";
dayjs.extend(weekday);
dayjs.extend(localeData);
dayjs.extend(customParseFormat);
export const VERDIS_KASSENZEICHEN_URL =
  "https://dev-cismet.github.io//verdis-desktop/#/?kassenzeichen=";

export function transactionPageExtractor(dataIn) {
  if (dataIn === undefined) {
    return [];
  } else {
    const transaction = dataIn?.kassenzeichenArrayRelationShip || [];
    if (transaction.length > 0) {
      let formattedZugeordnet;
      const data = transaction.map((t) => {
        if (t.zugeordnet_am) {
          const dateZugeordnet = dayjs(t.zugeordnet_am).toDate();
          formattedZugeordnet = dayjs(dateZugeordnet).format("DD.MM.YYYY");
        } else {
          formattedZugeordnet = null;
        }
        return {
          id: t.id,
          kassenzeichen: t.kassenzeichennummer,
          zugeordnet: formattedZugeordnet,
          linkToVerdis: VERDIS_KASSENZEICHEN_URL,
        };
      });

      return data;
    }

    return [];
  }
}
