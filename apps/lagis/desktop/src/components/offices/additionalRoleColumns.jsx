import { verwaltung } from "@carma-collab/wuppertal/lagis-desktop";
import { compare } from "../../core/tools/helper";
import { byText, dienststelleColumn, rolleArtColumn } from "../editing/columns";
import { ColorMark, dienststelleLabel } from "../editing/cells";

export const additionalRoleColumns = ({ dienststellen, rolleArten }) => [
  {
    key: "dienststelle",
    title: verwaltung.zusatzlicheRollen.dienststelleCol,
    width: "50%",
    view: {
      dataIndex: "agency",
      render: (title, record) => (
        <div className="flex items-center">
          <ColorMark color={record.color} />
          <span>{title}</span>
        </div>
      ),
      sorter: (a, b) => compare(a.agency, b.agency),
    },
    edit: (update) => ({
      ...dienststelleColumn(null, dienststellen, update),
      sorter: byText((row) =>
        dienststelleLabel(
          dienststellen.find((d) => d.id === row.dienststelleId)
        )
      ),
    }),
  },
  {
    key: "rolle",
    title: verwaltung.zusatzlicheRollen.rolleCol,
    width: "50%",
    view: { dataIndex: "rolle", sorter: (a, b) => compare(a.rolle, b.rolle) },
    edit: (update) => ({
      ...rolleArtColumn(null, rolleArten, update),
      sorter: byText(
        (row) => rolleArten.find((art) => art.id === row.rolleArtId)?.name
      ),
    }),
  },
];
