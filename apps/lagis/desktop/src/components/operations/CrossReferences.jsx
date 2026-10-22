import PropTypes from "prop-types";
import InfoBlock from "../ui/Blocks/InfoBlock";
import { Tabs } from "antd";
import CustomNotes from "../ui/notes/CustomNotes";
import { useEffect, useState } from "react";
import "./operations.css";
import { vorgange } from "@carma-collab/wuppertal/lagis-desktop";
import { useSearchParams } from "react-router-dom";
import { convertLParcelStrToSetUrlParams } from "../../core/tools/helper";
import { beschluesseExtractor } from "../../core/extractors/operationPageExtractors";
import SheetTable from "../editing/SheetTable";
import useDraftTable from "../editing/useDraftTable";
import useStammdatenList from "../editing/useStammdatenList";
import { beschlussColumns, kostenColumns } from "./crossReferenceColumns";
import { newBeschlussRow, newKostenRow } from "../../core/editing/vertrag";
import { touchedRows } from "../../core/editing/validation";
import { hasId } from "../../core/editing/ids";
import { useSelector } from "react-redux";
import { getOriginalSection } from "../../store/slices/editing";
import useActiveVertrag from "./useActiveVertrag";

const { TabPane } = Tabs;
const BESCHLUESSE_TITLE = "Beschlüsse";

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

  const shared = editable
    ? editQuerverweise.length > 0
    : querverweise?.length > 0;

  const tabActions =
    editable && vertrag
      ? { 2: kostenTable.actions, 3: beschlussTable.actions }[activeTab]
      : null;

  const sheet = (columns, table, rows, activeRow, setActiveRow) =>
    editable && !vertrag ? (
      <Empty />
    ) : (
      <SheetTable
        columns={columns}
        editable={editable}
        ready={Boolean(stammdaten)}
        view={{ rows, activeRow, setActiveRow }}
        edit={table.tableProps}
      />
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
      <InfoBlock
        editable={editable}
        title={vorgange.qkb.title}
        controlBar={tabActions}
      >
        <Tabs
          activeKey={activeTab}
          size="small"
          style={{ padding: "0 18px", height: "100%" }}
          onChange={setActiveTab}
        >
          <TabPane
            tab={
              <span
                className={`inline-block py-2${shared ? " text-red-500" : ""}`}
              >
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
            {sheet(
              kostenColumns({
                kostenarten: stammdaten?.kostenarten ?? [],
                missing: kostenMissing,
              }),
              kostenTable,
              viewKosten,
              activeCosts,
              setActiveCosts
            )}
          </TabPane>
          <TabPane
            tab={<span className="inline-block py-2">{BESCHLUESSE_TITLE}</span>}
            key="3"
            className="overflow-y-auto"
          >
            {sheet(
              beschlussColumns({
                beschlussarten: stammdaten?.beschlussarten ?? [],
                missing: beschlussMissing,
              }),
              beschlussTable,
              viewBeschluesse,
              activeResolution,
              setActiveResolution
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
