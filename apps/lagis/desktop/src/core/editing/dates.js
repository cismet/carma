import dayjs from "dayjs";
import { toTimestamp } from "../wizard/api";

// draft rows keep days as YYYY-MM-DD, cids wants a timestamp
export const toDay = (date) => (date ? dayjs(date).format("YYYY-MM-DD") : null);
export const toCidsDate = (day) =>
  day ? toTimestamp(dayjs(day).toDate()) : null;
