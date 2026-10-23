import { Tooltip } from "antd";
import { FlagOutlined } from "@ant-design/icons";
import { nutzung } from "@carma-collab/wuppertal/lagis-desktop";
import { compare, formatPrice } from "../../core/tools/helper";
import { gesamtpreis } from "../../core/wizard/usageData";
import {
  buchungsNummer,
  canToggleBuchwert,
  isBuchwert,
  stilleReserve,
} from "../../core/editing/usage";
import { usageColumns } from "../editing/columns";

// Both modes use a fixed layout with these widths and one-line cells, so
// toggling edit mode moves neither columns nor rows.
const WIDTH = {
  nutzung: 110,
  buchungs: 130,
  anlageklasse: 260,
  nutzungsart: 120,
  bezeichnung: 240,
  fläche: 120,
  preis: 120,
  gesamtpreis: 130,
  stille: 130,
  buchwert: 100,
};
export const NUTZUNG_SCROLL = {
  x: Object.values(WIDTH).reduce((sum, w) => sum + w, 0),
};

const Flag = ({ buchwert }) => (
  <div className="flex items-center justify-center">
    <FlagOutlined style={{ color: buchwert ? "green" : "red" }} />
  </div>
);

// Anlageklasse, Nutzungsart, Fläche and m²-Preis are inputs and the Buchwert
// flag toggles on click. Buchungs-Nr, Gesamtpreis and Stille Reserve follow
// the draft live, like in Java. Sorting uses the shown values, like the read
// mode table.
const editParts = (stammdaten, originalById, invalid) => (update) => {
  const [anlageklasse, nutzungsart, flaeche, preis] = usageColumns(
    stammdaten,
    invalid
  )(update);
  const anlageklasseName = new Map(
    stammdaten.anlageklassen.map((k) => [k.id, k.bezeichnung])
  );
  const nutzungsartName = new Map(
    stammdaten.nutzungsarten.map((a) => [a.id, a.bezeichnung])
  );
  const nutzungsartKey = new Map(
    stammdaten.nutzungsarten.map((a) => [a.id, a.schluessel])
  );
  const original = (row) => originalById.get(row.id);
  const stille = (row) => stilleReserve(original(row), row);
  const shown = {
    nutzung: (row) => row.nutzungId,
    buchungs: (row) => buchungsNummer(original(row), row),
    anlageklasse: (row) => anlageklasseName.get(row.anlageklasseId),
    nutzungsart: (row) => nutzungsartKey.get(row.nutzungsartId),
    bezeichnung: (row) => nutzungsartName.get(row.nutzungsartId),
    fläche: (row) => row.flaeche,
    preis: (row) => row.quadratmeterpreis,
    // Java shows the value minus the Stille Reserve, i.e. the Buchwert
    gesamtpreis: (row) =>
      gesamtpreis(row) === null ? null : gesamtpreis(row) - stille(row),
    stille,
    buchwert: (row) => isBuchwert(original(row), row),
  };
  const sorter = (key) => (a, b) => compare(shown[key](a), shown[key](b));
  const readOnly = (key, format = (value) => value) => ({
    dataIndex: key,
    sorter: sorter(key),
    render: (_, row) => {
      const value = shown[key](row);
      return value === null || value === undefined ? "" : format(value);
    },
  });
  const buchwertCell = (_, row) => {
    const flag = <Flag buchwert={shown.buchwert(row)} />;
    if (!canToggleBuchwert(original(row), row)) {
      return flag;
    }
    return (
      <Tooltip title="Buchwert umschalten">
        <div
          className="cursor-pointer"
          onClick={() => update(row.id, { istBuchwert: !shown.buchwert(row) })}
        >
          {flag}
        </div>
      </Tooltip>
    );
  };
  return {
    nutzung: readOnly("nutzung"),
    buchungs: readOnly("buchungs"),
    anlageklasse: { ...anlageklasse, sorter: sorter("anlageklasse") },
    nutzungsart: readOnly("nutzungsart"),
    bezeichnung: { ...nutzungsart, sorter: sorter("bezeichnung") },
    fläche: { ...flaeche, sorter: sorter("fläche") },
    preis: { ...preis, sorter: sorter("preis") },
    gesamtpreis: readOnly("gesamtpreis", formatPrice),
    stille: readOnly("stille", formatPrice),
    buchwert: { ...readOnly("buchwert"), render: buchwertCell },
  };
};

export const nutzungColumns = ({ stammdaten, originalById, invalid }) => {
  let cached;
  const edit = (key) => (update) => {
    if (cached?.update !== update) {
      cached = {
        update,
        parts: editParts(stammdaten, originalById, invalid)(update),
      };
    }
    return cached.parts[key];
  };
  const column = (key, title, view = {}) => ({
    key,
    title,
    width: WIDTH[key],
    view: {
      dataIndex: key,
      sorter: (a, b) => compare(a[key], b[key]),
      ...view,
    },
    edit: edit(key),
  });
  return [
    column("nutzung", nutzung.nutzungTable.nutzungCol),
    column("buchungs", nutzung.nutzungTable.buchungsCol),
    column("anlageklasse", nutzung.nutzungTable.anlageklasseCol, {
      render: (record, row) => (
        // the cell may cut a long name, so the tooltip shows it in full
        <Tooltip title={record && `${record} (${row.anlageklasseKey})`}>
          <span>{record}</span>
        </Tooltip>
      ),
    }),
    // like Java: the Schlüssel of the Nutzungsart, read-only
    column("nutzungsart", "Nutzungsart"),
    {
      ...column("bezeichnung", nutzung.nutzungTable.bezeichnungCol),
      required: true,
    },
    column("fläche", nutzung.nutzungTable.flacheCol),
    column("preis", nutzung.nutzungTable.preisCol),
    column("gesamtpreis", nutzung.nutzungTable.gesamtpreisCol),
    column("stille", nutzung.nutzungTable.stilleCol),
    column("buchwert", nutzung.nutzungTable.buchwertCol, {
      render: (buchwert) => <Flag buchwert={buchwert} />,
    }),
  ];
};
