import PropTypes from "prop-types";
import { useEffect, useState } from "react";
import InfoBlock from "../ui/Blocks/InfoBlock";
import { defaultLinksColor } from "../../core/tools/helper";
import { officesPageExtractor } from "../../core/extractors/officesPageExtractor";
import { HistoryOutlined } from "@ant-design/icons";
import AgenciesHistoryModal from "./AgenciesHistoryModal";
import SheetTable from "../editing/SheetTable";
import { agencyColumns } from "./agencyColumns";
import { verwaltung } from "@carma-collab/wuppertal/lagis-desktop";
const Agencies = ({
  dataIn,
  extractor = officesPageExtractor,
  setAgencyGeom,
  setActiveTableRow,
  activeRowId,
  draftTable = {},
  dienststellen,
  parcelArea,
}) => {
  const [agency, setAgency] = useState([]);
  const [activeRow, setActiveRow] = useState();
  const [history, setHistory] = useState([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  // owned by the Offices page, which shares it with the drawing map
  const { editable, actions, tableProps } = draftTable;
  useEffect(() => {
    const data = extractor(dataIn);
    setAgency(data?.currentOffices);
    setActiveRow(data?.currentOffices[0]);
    setHistory(data?.history);
  }, [dataIn]);
  useEffect(() => {
    if (activeRow?.extraGeomeOffice?.geo_field) {
      setActiveTableRow(activeRow?.id);
      setAgencyGeom({
        agency,
      });
    }
  }, [activeRow]);

  useEffect(() => {
    if (activeRowId && activeRowId !== activeRow?.id) {
      const agencyWithId = agency.filter((a) => a.id === activeRowId);
      if (agencyWithId) {
        setActiveRow(agencyWithId[0]);
      }
    }
  }, [activeRowId]);

  return (
    <div
      style={{
        height: "100%",
        backgroundColor: "#ffffff",
        borderRadius: "6px",
        overflow: "auto",
      }}
      className="shadow-md"
    >
      <InfoBlock
        editable={editable}
        title={verwaltung.dienststellen.tableTitle}
        extraActions={
          history.length > 0 ? (
            <HistoryOutlined onClick={() => setIsModalOpen(!isModalOpen)} />
          ) : (
            <HistoryOutlined style={{ color: defaultLinksColor }} />
          )
        }
        controlBar={actions}
      >
        <div className="relative">
          <SheetTable
            columns={agencyColumns({
              dienststellen,
              rowCount: tableProps.rows.length,
              parcelArea,
            })}
            editable={editable}
            ready={Boolean(dienststellen)}
            fixHeight
            view={{ rows: agency, activeRow, setActiveRow }}
            edit={tableProps}
          />
        </div>
      </InfoBlock>
      <AgenciesHistoryModal
        open={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        history={history}
      />
    </div>
  );
};
export default Agencies;
Agencies.propTypes = {
  dataIn: PropTypes.object,
  extractor: PropTypes.func,
  setAgencyGeom: PropTypes.func,
  setActiveTableRow: PropTypes.func,
  activeRowId: PropTypes.string,
  draftTable: PropTypes.object,
  dienststellen: PropTypes.array,
  parcelArea: PropTypes.number,
};
