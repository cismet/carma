import { vorgange } from "@carma-collab/wuppertal/lagis-desktop";
import { compare } from "../../core/tools/helper";
import { byText, euros, numberColumn, textColumn } from "../editing/columns";
import { CellSelect } from "../editing/cells";

const byNumber = (value) => (a, b) =>
  (value(a) ?? -Infinity) - (value(b) ?? -Infinity);

const priceColumn = (key, title, editIndex) => ({
  key,
  title,
  width: "25%",
  view: {
    dataIndex: key,
    sorter: (a, b) => euros(a[key]) - euros(b[key]),
  },
  edit: (update) => ({
    ...numberColumn(null, editIndex, update),
    sorter: byNumber((row) => row[editIndex]),
  }),
});

export const contractColumns = ({ vertragsarten, invalid }) => {
  const arten = vertragsarten ?? [];
  const artName = new Map(arten.map((art) => [art.id, art.bezeichnung]));
  return [
    {
      key: "vertragsart",
      title: vorgange.vorgangeTable.vertragsartCol,
      width: "25%",
      required: true,
      view: {
        dataIndex: "vertragsart",
        sorter: (a, b) => compare(a.vertragsart, b.vertragsart),
      },
      edit: (update) => ({
        dataIndex: "artId",
        sorter: byText((row) => artName.get(row.artId)),
        render: (artId, record) => (
          <CellSelect
            size="small"
            showSearch
            optionFilterProp="label"
            placeholder="Vertragsart"
            className="w-full"
            status={invalid(record, "artId") ? "error" : undefined}
            getPopupContainer={() => document.body}
            options={arten.map((art) => ({
              value: art.id,
              label: art.bezeichnung,
            }))}
            value={artId}
            onChange={(next) => update(record.id, { artId: next })}
          />
        ),
      }),
    },
    {
      key: "nummer",
      title: vorgange.vorgangeTable.nummerCol,
      width: "25%",
      view: {
        dataIndex: "nummer",
        sorter: (a, b) => compare(a.nummer, b.nummer),
      },
      edit: (update) => textColumn(null, "aktenzeichen", update),
    },
    priceColumn(
      "quadratmeterpreis",
      vorgange.vorgangeTable.quadratmeterpreisCol,
      "quadratmeterpreis"
    ),
    priceColumn(
      "kaufpreis",
      vorgange.vorgangeTable.kaufpreisCol,
      "gesamtpreis"
    ),
  ];
};
