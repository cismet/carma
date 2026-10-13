import PropTypes from "prop-types";
import InfoBlock from "../ui/Blocks/InfoBlock";
import { Select, Spin, Tabs } from "antd";
import TableCustom from "../ui/tables/TableCustom";
import CustomNotes from "../ui/notes/CustomNotes";
import { useEffect, useState } from "react";
import "./operations.css";
import { vorgange } from "@carma-collab/wuppertal/lagis-desktop";
import { useSearchParams } from "react-router-dom";
import { convertLParcelStrToSetUrlParams } from "../../core/tools/helper";
import { beschluesseExtractor } from "../../core/extractors/operationPageExtractors";
import EditableTable from "../editing/EditableTable";
import useDraftTable from "../editing/useDraftTable";
import useStammdatenList from "../editing/useStammdatenList";
import {
  byText,
  dateColumn,
  numberColumn,
  requiredTitle,
} from "../editing/columns";
import { newBeschlussRow, newKostenRow } from "../../core/editing/vertrag";
import { touchedRows } from "../../core/editing/validation";
import { hasId } from "../../core/editing/ids";
import { useSelector } from "react-redux";
import { getOriginalSection } from "../../store/slices/editing";
import useActiveVertrag from "./useActiveVertrag";

const { TabPane } = Tabs;
const BESCHLUESSE_TITLE = "Beschlüsse";
const columnsResolutions = [
  {
    title: "Beschlussart",
    dataIndex: "beschlussart",
  },
  {
    title: "Datum",
    dataIndex: "datum",
  },
];
const columnsCosts = [
  {
    title: vorgange.qkb.kostenartCol,
    dataIndex: "kostenart",
  },
  {
    title: vorgange.qkb.betragCol,
    dataIndex: "betrag",
  },
  {
    title: vorgange.qkb.anweisungCol,
    dataIndex: "anweisung",
  },
];

// artColumn for Kostenart / Beschlussart; only new or changed rows go red
const artColumn = (title, arten, missing) => (update) => ({
  title: requiredTitle(title),
  key: "art",
  dataIndex: "artId",
  sorter: byText(
    (row) => arten.find((art) => art.id === row.artId)?.bezeichnung
  ),
  render: (artId, record) => (
    <Select
      size="small"
      showSearch
      optionFilterProp="label"
      placeholder={title}
      className="w-full"
      status={missing(record) ? "error" : undefined}
      getPopupContainer={() => document.body}
      options={arten.map((art) => ({ value: art.id, label: art.bezeichnung }))}
      value={artId}
      onChange={(next) => update(record.id, { artId: next })}
    />
  ),
});

const kostenColumns = (kostenarten, missing) => (update) =>
  [
    artColumn(vorgange.qkb.kostenartCol, kostenarten, missing)(update),
    {
      ...numberColumn(vorgange.qkb.betragCol, "betrag", update),
      key: "betrag",
      sorter: (a, b) => (a.betrag ?? -Infinity) - (b.betrag ?? -Infinity),
    },
    dateColumn(vorgange.qkb.anweisungCol, "datum", update),
  ];

const beschlussColumns = (beschlussarten, missing) => (update) =>
  [
    artColumn("Beschlussart", beschlussarten, missing)(update),
    dateColumn("Datum", "datum", update),
  ];

// a red Art only on rows that are new or changed, like the save check
const useMissingArt = (vertrag, field, idOf) => {
  const original = useSelector(getOriginalSection("vertrag"));
  const before = original?.vertraege.find((row) => row.id === vertrag?.id);
  const touched = new Set(
    touchedRows(before?.[field], vertrag?.[field], idOf).map((row) => row.id)
  );
  return (record) => touched.has(record.id) && !hasId(record.artId);
};

// one table of the selected draft Vertrag: its Kosten or Beschlüsse
const useVertragRows = (vertrag, update, field, newRow) =>
  useDraftTable({
    section: "vertrag",
    field: "vertraege",
    rows: vertrag?.[field] ?? [],
    onRowsChange: (next) => update({ [field]: next }),
    newRow,
  });

const Empty = () => (
  <div className="p-4 text-center text-gray-400">Kein Vertrag ausgewählt</div>
);

// activeDataId: the Vertrag selected in view mode; editSelectedId in edit mode
const CrossReferences = ({
  dataIn,
  extractor,
  crossExtractor,
  jwt,
  activeDataId,
  editSelectedId,
}) => {
  const [kosten, setKosten] = useState([]);
  const [beschluesse, setBeschluesse] = useState([]);
  const [activeCosts, setActiveCosts] = useState();
  const [activeResolution, setActiveResolution] = useState();
  const [querverweise, setQuerverweise] = useState();
  const [, setUrlParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState("1");

  const { editable, draft, vertrag, update } = useActiveVertrag(editSelectedId);
  const stammdaten = useStammdatenList("vorgang", editable);
  const kostenTable = useVertragRows(vertrag, update, "kosten", newKostenRow);
  const beschlussTable = useVertragRows(
    vertrag,
    update,
    "beschluesse",
    newBeschlussRow
  );
  const kostenMissing = useMissingArt(vertrag, "kosten", (r) => r.kostenId);
  const beschlussMissing = useMissingArt(
    vertrag,
    "beschluesse",
    (r) => r.beschlussId
  );

  const handleCrossReferenceClick = (q) => {
    setUrlParams(convertLParcelStrToSetUrlParams(q));
  };

  useEffect(() => {
    let cancelled = false;
    crossExtractor(dataIn, jwt).then((list) => {
      if (!cancelled) {
        setQuerverweise(list);
      }
    });
    setKosten(extractor(dataIn));
    setBeschluesse(beschluesseExtractor(dataIn));
    return () => {
      cancelled = true;
    };
  }, [dataIn]);

  // view: the Vorgänge table starts on its first row
  const viewVertragId =
    activeDataId ?? dataIn?.ar_vertraegeArray?.[0]?.vertrag.id;
  const viewKosten = kosten.filter((k) => k.vertragId === viewVertragId);
  const viewBeschluesse = beschluesse.filter(
    (b) => b.vertragId === viewVertragId
  );

  // Java disables the Querverweise in edit mode and updates them on remove
  const editQuerverweise = [
    ...new Set((draft?.vertraege ?? []).flatMap((row) => row.querverweise)),
  ];

  const tabActions =
    editable && vertrag
      ? { 2: kostenTable.actions, 3: beschlussTable.actions }[activeTab]
      : null;

  const editTable = (table, columns) =>
    !vertrag ? (
      <Empty />
    ) : stammdaten ? (
      <EditableTable
        {...table.tableProps}
        fixHeight={false}
        columns={columns}
      />
    ) : (
      <div className="flex justify-center p-8">
        <Spin />
      </div>
    );

  return (
    <div
      className="cross-data h-full shadow-md pb-8"
      style={{
        height: "100%",
        backgroundColor: "#ffffff",
        borderRadius: "6px",
        overflow: "hidden",
      }}
    >
      <InfoBlock title={vorgange.qkb.title} controlBar={tabActions}>
        <Tabs
          activeKey={activeTab}
          size="small"
          style={{ padding: "0 18px", height: "100%" }}
          onChange={setActiveTab}
        >
          <TabPane
            tab={
              <span className="inline-block py-2">
                {vorgange.qkb.querverweiseTitle}
              </span>
            }
            key="1"
            className="overflow-y-auto pb-2"
          >
            {editable ? (
              editQuerverweise.map((q) => (
                <div key={q} className="text-gray-500">
                  {q}
                </div>
              ))
            ) : querverweise && querverweise?.length > 0 ? (
              querverweise?.map((q, idx) => (
                <div key={idx}>
                  <a
                    href={q}
                    onClick={(e) => {
                      e.preventDefault();
                      handleCrossReferenceClick(q);
                    }}
                    className="text-blue-600 underline hover:text-blue-800"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {q}
                  </a>
                </div>
              ))
            ) : (
              <CustomNotes currentText={""} />
            )}
          </TabPane>
          <TabPane
            tab={
              <span className="inline-block py-2">
                {vorgange.qkb.kostenTitle}
              </span>
            }
            key="2"
            className="overflow-y-auto"
          >
            {editable ? (
              editTable(
                kostenTable,
                kostenColumns(stammdaten?.kostenarten ?? [], kostenMissing)
              )
            ) : (
              <div className="flex">
                <TableCustom
                  columns={columnsCosts}
                  data={viewKosten}
                  activeRow={activeCosts}
                  setActiveRow={setActiveCosts}
                />
              </div>
            )}
          </TabPane>
          <TabPane
            tab={<span className="inline-block py-2">{BESCHLUESSE_TITLE}</span>}
            key="3"
            className="overflow-y-auto"
          >
            {editable ? (
              editTable(
                beschlussTable,
                beschlussColumns(
                  stammdaten?.beschlussarten ?? [],
                  beschlussMissing
                )
              )
            ) : (
              <div className="flex">
                <TableCustom
                  columns={columnsResolutions}
                  data={viewBeschluesse}
                  activeRow={activeResolution}
                  setActiveRow={setActiveResolution}
                />
              </div>
            )}
          </TabPane>
        </Tabs>
      </InfoBlock>
    </div>
  );
};

export default CrossReferences;
CrossReferences.propTypes = {
  /**
   * The current main data object that is being used
   */
  dataIn: PropTypes.object,
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
