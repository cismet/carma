import PropTypes from "prop-types";
import { useEffect, useState } from "react";
import InfoBlock from "../ui/Blocks/InfoBlock";
import TableCustom from "../ui/tables/TableCustom";
import { Spin } from "antd";
import { compare, defaultLinksColor } from "../../core/tools/helper";
import { officesPageExtractor } from "../../core/extractors/officesPageExtractor";
import { HistoryOutlined } from "@ant-design/icons";
import AgenciesHistoryModal from "./AgenciesHistoryModal";
import EditableTable from "../editing/EditableTable";
import useDraftTable from "../editing/useDraftTable";
import useStammdatenList from "../editing/useStammdatenList";
import { dienststelleColumn, numberColumn } from "../editing/columns";
import { newDienststelleRow } from "../../core/wizard/adminData";
import { verwaltung } from "@carma-collab/wuppertal/lagis-desktop";
const columns = [
  {
    title: verwaltung.dienststellen.dienststelleCol,
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
  {
    title: verwaltung.dienststellen.flacheCol,
    dataIndex: "area",
    sorter: (a, b) => compare(a.area, b.area),
  },
];
const Agencies = ({
  dataIn,
  extractor = officesPageExtractor,
  setAgencyGeom,
  setActiveTableRow,
  activeRowId,
}) => {
  const [agency, setAgency] = useState([]);
  const [activeRow, setActiveRow] = useState();
  const [history, setHistory] = useState([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const { editable, actions, tableProps } = useDraftTable({
    section: "admin",
    field: "dienststellen",
    newRow: newDienststelleRow,
  });
  const dienststellen = useStammdatenList("dienststellen", editable);
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
          {!editable ? (
            <TableCustom
              columns={columns}
              data={agency}
              activeRow={activeRow}
              setActiveRow={setActiveRow}
              fixHeight={true}
              selectedFeatureKey={"selectedGeom"}
            />
          ) : dienststellen ? (
            <EditableTable
              {...tableProps}
              columns={(update) => [
                dienststelleColumn(
                  verwaltung.dienststellen.dienststelleCol,
                  dienststellen,
                  update
                ),
                numberColumn(
                  verwaltung.dienststellen.flacheCol,
                  "flaeche",
                  update
                ),
              ]}
            />
          ) : (
            <div className="flex justify-center p-8">
              <Spin />
            </div>
          )}
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
};
