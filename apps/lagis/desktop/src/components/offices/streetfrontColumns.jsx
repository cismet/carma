import { verwaltung } from "@carma-collab/wuppertal/lagis-desktop";
import { compare } from "../../core/tools/helper";
import { byText, numberColumn, strassenColumn } from "../editing/columns";

export const streetfrontColumns = ({ strassennamen }) => [
  {
    key: "strasse",
    title: verwaltung.strassen.strasseCol,
    width: "50%",
    view: {
      dataIndex: "street",
      sorter: (a, b) => compare(a.street, b.street),
    },
    edit: (update) => ({
      ...strassenColumn(null, strassennamen, update),
      sorter: byText((row) => row.strassenname),
    }),
  },
  {
    key: "laenge",
    title: verwaltung.strassen.lange,
    width: "50%",
    view: {
      dataIndex: "length",
      sorter: (a, b) => compare(a.length, b.length),
    },
    edit: (update) => ({
      ...numberColumn(null, "laenge", update),
      sorter: (a, b) => compare(a.laenge, b.laenge),
    }),
  },
];
