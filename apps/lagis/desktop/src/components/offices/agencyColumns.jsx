import { verwaltung } from "@carma-collab/wuppertal/lagis-desktop";
import { compare } from "../../core/tools/helper";
import { dienststelleArea } from "../../core/editing/admin";
import { dienststelleColumn } from "../editing/columns";

const formatArea = (area) =>
  Number.isFinite(area) ? Math.round(area).toLocaleString("de-DE") : "";

export const agencyColumns = ({ dienststellen, rowCount, parcelArea }) => [
  {
    key: "dienststelle",
    title: verwaltung.dienststellen.dienststelleCol,
    width: "50%",
    view: {
      dataIndex: "agency",
      render: (title, record) => (
        <div className="flex items-center">
          <span
            style={{
              width: "9px",
              height: "11px",
              marginRight: "6px",
              backgroundColor: record?.color || "transparent",
            }}
          ></span>
          <span>{title}</span>
        </div>
      ),
      sorter: (a, b) => compare(a.agency, b.agency),
    },
    edit: (update) => dienststelleColumn(null, dienststellen, update),
  },
  {
    key: "flaeche",
    title: verwaltung.dienststellen.flacheCol,
    width: "50%",
    view: { dataIndex: "area", sorter: (a, b) => compare(a.area, b.area) },
    edit: () => ({
      dataIndex: "flaeche",
      render: (_, record) =>
        formatArea(dienststelleArea(record, rowCount, parcelArea)),
    }),
  },
];
