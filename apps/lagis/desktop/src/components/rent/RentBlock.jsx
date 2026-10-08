import PropTypes from "prop-types";
import InfoBlock from "../ui/Blocks/InfoBlock";
import TableCustom from "../ui/tables/TableCustom";
import { InputNumber, Select, Spin, Tag } from "antd";
import CustomNotes from "../ui/notes/CustomNotes";
import EditableTable from "../editing/EditableTable";
import {
  byDay,
  byText,
  dateColumn,
  requiredTitle,
  textColumn,
  VIEW_DAY,
  withSort,
} from "../editing/columns";
import useDraftTable from "../editing/useDraftTable";
import useStammdatenList from "../editing/useStammdatenList";
import { newMipaRow } from "../../core/editing/mipa";
import { MIPA_RULES } from "../../core/editing/validation";
import useInvalidCells from "../editing/useInvalidCells";
import { useEffect, useState } from "react";
import dayjs from "dayjs";
import weekday from "dayjs/plugin/weekday";
import localeData from "dayjs/plugin/localeData";
import customParseFormat from "dayjs/plugin/customParseFormat";
import { mipa } from "@carma-collab/wuppertal/lagis-desktop";
dayjs.extend(weekday);
dayjs.extend(localeData);
dayjs.extend(customParseFormat);
const merkmalNames = (names) => names.join(", ");
// the collab texts have no Nutzer title yet
const NUTZER_TITLE = mipa.mipaTable.nutzerCol ?? "Nutzer";

const columns = [
  {
    title: mipa.mipaTable.lageCol,
    key: "lage",
    dataIndex: "lage",
    sorter: byText((row) => row.lage),
  },
  {
    title: mipa.mipaTable.aktenzeichenCol,
    key: "aktenzeichen",
    dataIndex: "aktenzeichen",
    sorter: byText((row) => row.aktenzeichen),
  },
  {
    title: mipa.mipaTable.flaecheCol,
    key: "flaeche",
    dataIndex: "flaeche",
    sorter: byText((row) => row.flaeche),
  },
  {
    title: mipa.mipaTable.nutzungCol,
    key: "nutzung",
    dataIndex: "nutzung",
    sorter: byText((row) => row.nutzung),
  },
  {
    title: NUTZER_TITLE,
    key: "nutzer",
    dataIndex: "nutzer",
    sorter: byText((row) => row.nutzer),
  },
  {
    title: mipa.mipaTable.vertragsbeginCol,
    key: "vertragsbeginn",
    dataIndex: "vertragsbegin",
    sorter: byDay((row) => row.vertragsbegin, VIEW_DAY),
  },
  {
    title: mipa.mipaTable.vertragsendeCol,
    key: "vertragsende",
    dataIndex: "vertragsende",
    sorter: byDay((row) => row.vertragsende, VIEW_DAY),
  },
  {
    title: mipa.mipaTable.merkmaleCol,
    key: "merkmale",
    dataIndex: "merkmale",
    render: (merkmale) => (
      <>
        {merkmale.map((m, i) => (
          <Tag key={i} color={i % 2 === 0 ? "green" : "red"}>
            {m.mipa_merkmal.bezeichnung}
          </Tag>
        ))}
      </>
    ),
    sorter: byText((row) =>
      merkmalNames(row.merkmale.map((m) => m.mipa_merkmal.bezeichnung))
    ),
  },
];
const popup = () => document.body;

const titleOf = (title, field) =>
  MIPA_RULES.required.includes(field) ? requiredTitle(title) : title;

// stammdaten: { kategorien, merkmale }; invalid(record, field) marks a cell red
const editColumns = (stammdaten, invalid) => {
  const kategorieName = new Map(
    stammdaten.kategorien.map((k) => [k.id, k.bezeichnung])
  );
  const merkmalName = new Map(
    stammdaten.merkmale.map((m) => [m.id, m.bezeichnung])
  );
  const column = (build, title, field, update) =>
    build(titleOf(title, field), field, update, (record) =>
      invalid(record, field)
    );
  return (update) => [
    column(textColumn, mipa.mipaTable.lageCol, "lage", update),
    column(textColumn, mipa.mipaTable.aktenzeichenCol, "aktenzeichen", update),
    {
      title: mipa.mipaTable.flaecheCol,
      key: "flaeche",
      dataIndex: "flaeche",
      sorter: byText((row) => row.flaeche),
      render: (flaeche, record) => (
        <InputNumber
          size="small"
          min={0}
          precision={0}
          className="w-full"
          value={flaeche}
          onChange={(next) => update(record.id, { flaeche: next ?? null })}
        />
      ),
    },
    {
      title: titleOf(mipa.mipaTable.nutzungCol, "kategorieId"),
      key: "nutzung",
      dataIndex: "kategorieId",
      sorter: byText((row) => kategorieName.get(row.kategorieId)),
      render: (kategorieId, record) => (
        <Select
          size="small"
          status={invalid(record, "kategorieId") ? "error" : undefined}
          showSearch
          allowClear
          optionFilterProp="label"
          placeholder="Nutzung"
          className="w-full"
          getPopupContainer={popup}
          options={stammdaten.kategorien.map((k) => ({
            value: k.id,
            label: k.bezeichnung,
          }))}
          value={kategorieId}
          // like Java: another Kategorie drops the selected number
          onChange={(next) =>
            update(record.id, {
              kategorieId: next,
              ...(next !== kategorieId ? { ausgewaehlteNummer: null } : {}),
            })
          }
        />
      ),
    },
    column(textColumn, NUTZER_TITLE, "nutzer", update),
    column(
      dateColumn,
      mipa.mipaTable.vertragsbeginCol,
      "vertragsbeginn",
      update
    ),
    column(dateColumn, mipa.mipaTable.vertragsendeCol, "vertragsende", update),
    {
      title: mipa.mipaTable.merkmaleCol,
      key: "merkmale",
      dataIndex: "merkmalIds",
      sorter: byText((row) =>
        merkmalNames(row.merkmalIds.map((id) => merkmalName.get(id)))
      ),
      render: (merkmalIds, record) => (
        <Select
          size="small"
          mode="multiple"
          maxTagCount="responsive"
          placeholder="Merkmale"
          className="w-full"
          getPopupContainer={popup}
          options={stammdaten.merkmale.map((m) => ({
            value: m.id,
            label: m.bezeichnung,
          }))}
          value={merkmalIds}
          onChange={(next) => update(record.id, { merkmalIds: next })}
        />
      ),
    },
  ];
};

const mockExtractor = (input) => {
  return [
    {
      id: "1",
      lage: "Luntenbecker",
      aktenzeichen: "3434534",
      flaeche: "237",
      nutzung: "Other",
      vertragsbegin: "02.05.2023",
      vertragsende: "02.05.2023",
      merkmale: [
        { text: "Altlast", color: "gold" },
        { text: "Biotop", color: "cyan" },
      ],
      querverweise: "Querverweise 1",
      note: "Bemerkung 1",
    },
    {
      id: "2",
      lage: "Luntenbecker",
      aktenzeichen: "3434534",
      flaeche: "237",
      nutzung: "Other",
      vertragsbegin: "02.05.2023",
      vertragsende: "02.05.2023",
      merkmale: [{ text: "Unentgeltlich", color: "gold" }],
      querverweise: "Querverweise 2",
      note: "Bemerkung 2",
    },
    {
      id: "3",
      lage: "Luntenbecker",
      aktenzeichen: "3434534",
      flaeche: "237",
      nutzung: "Other",
      vertragsbegin: "02.05.2023",
      vertragsende: "02.05.2023",
      merkmale: [{ text: "keine Akte", color: "cyan" }],
      querverweise: "Querverweise 3",
      note: "Bemerkung 3",
    },
    {
      id: "4",
      lage: "Luntenbecker",
      aktenzeichen: "3434534",
      flaeche: "237",
      nutzung: "Other",
      vertragsbegin: "02.05.2023",
      vertragsende: "02.05.2023",
      merkmale: [
        { text: "Altlast", color: "gold" },
        { text: "keine Akte", color: "cyan" },
      ],
      querverweise: "Querverweise 4",
      note: "Bemerkung 4",
    },
  ];
};
const RentBlock = ({
  dataIn,
  extractor = mockExtractor,
  width = 231,
  height = 188,
  style,
  setExtraRentsGeom,
  selectedTableRowId,
  setSelectedTableRowId,
  selectedTableIdByMap,
}) => {
  const isStory = false;
  const storyStyle = { width, height, ...style };
  const [rents, setRents] = useState([]);
  const [activeRow, setActiveRow] = useState();
  const [sort, setSort] = useState({});
  const { editable, actions, tableProps } = useDraftTable({
    section: "mipa",
    field: "mipas",
    newRow: (draft) => newMipaRow(draft.parcelGeometry),
  });
  const stammdaten = useStammdatenList("mipa", editable);
  const invalid = useInvalidCells("mipa", tableProps.rows, MIPA_RULES);
  const activeDraftRow = tableProps.rows.find(
    (row) => row.id === tableProps.activeId
  );
  const updateBemerkung = (bemerkung) =>
    tableProps.onChange(
      tableProps.rows.map((row) =>
        row.id === activeDraftRow.id ? { ...row, bemerkung } : row
      )
    );
  useEffect(() => {
    const data = extractor(dataIn);
    setRents(data);
    setActiveRow(data[0]);
  }, [dataIn]);
  useEffect(() => {
    if (
      selectedTableIdByMap !== null &&
      selectedTableIdByMap !== activeRow?.id
    ) {
      setActiveRow(rents[selectedTableIdByMap]);
    }
  }, [selectedTableIdByMap]);
  useEffect(() => {
    if (activeRow) {
      const { id } = activeRow;
      setExtraRentsGeom(rents);
      setSelectedTableRowId(id);
    }
  }, [activeRow]);
  return (
    <div
      style={
        isStory
          ? storyStyle
          : {
              backgroundColor: "#FFFFFF",
              borderRadius: "6px",
            }
      }
      className="h-full"
    >
      <div className="h-[60%]">
        <InfoBlock title={mipa.mipaTable.tableTitle} controlBar={actions}>
          <div className="overflow-auto">
            {!editable ? (
              <TableCustom
                columns={withSort(columns, sort)}
                onSortChange={setSort}
                data={rents}
                activeRow={activeRow}
                setActiveRow={setActiveRow}
                selectedFeatureKey={"selectedTableGeom"}
              />
            ) : stammdaten ? (
              <EditableTable
                {...tableProps}
                fixHeight={false}
                columns={(update) =>
                  withSort(editColumns(stammdaten, invalid)(update), sort)
                }
                onSortChange={setSort}
              />
            ) : (
              <div className="flex justify-center p-8">
                <Spin />
              </div>
            )}
          </div>
        </InfoBlock>
      </div>
      <div className="h-[40%] flex gap-4 overflow-auto">
        <div className="w-full">
          <InfoBlock title={mipa.bemerkung.title}>
            {editable ? (
              <CustomNotes
                styles={"pt-2 pl-2 pb-2"}
                ifDisable={!activeDraftRow}
                currentText={activeDraftRow?.bemerkung ?? ""}
                onChange={updateBemerkung}
              />
            ) : (
              <CustomNotes
                styles={"pt-2 pl-2 pb-2"}
                currentText={activeRow?.note}
              />
            )}
          </InfoBlock>
        </div>
        <div className="w-full">
          {/* Java computes the Querverweise, they are not editable */}
          <InfoBlock title={mipa.querverweise.title}>
            <CustomNotes
              styles={"pt-2 pr-2 pb-2"}
              currentText={activeRow?.querverweise}
            />
          </InfoBlock>
        </div>
      </div>
    </div>
  );
};

export default RentBlock;
RentBlock.propTypes = {
  /**
   * The current main data object that is being used
   */
  dataIn: PropTypes.array,
  /**
   * The extractor function that is used to transform the dataIn object into the data object
   */
  extractor: PropTypes.func,
  /**
   * The width of the component
   * @default 300
   * @type number
   * @required false
   * @control input
   * @group size
   *
   **/
  width: PropTypes.number,

  /**
   * The height of the component
   *
   * @default 300
   * @type number
   * @required false
   * @control input
   *
   **/

  height: PropTypes.number,
};
