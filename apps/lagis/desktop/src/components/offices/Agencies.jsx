import PropTypes from "prop-types";
import { useEffect, useState } from "react";
import InfoBlock from "../ui/Blocks/InfoBlock";
import ToggleModal from "../ui/control-board/ToggleModal";
import TableCustom from "../ui/tables/TableCustom";
import ModalForm from "../ui/forms/ModalForm";
import { nanoid } from "@reduxjs/toolkit";
import { compare, defaultLinksColor } from "../../core/tools/helper";
import { officesPageExtractor } from "../../core/extractors/officesPageExtractor";
import { HistoryOutlined } from "@ant-design/icons";
import { Modal, Table } from "antd";
import "../../components/ui/control-board/toggle.css";
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
const historyColumns = [
  {
    title: "Dienststelle",
    dataIndex: "title",
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
        <span className="text-xs">{title}</span>
      </div>
    ),
  },
  {
    title: "Fläche in m²",
    dataIndex: "size",
    render: (size) => <span className="text-xs">{size}</span>,
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
  const addAgency = () => {
    const newAgency = {
      id: nanoid(),
      agency: "",
      area: "",
    };
    setAgency((prev) => [...prev, newAgency]);
    setActiveRow(newAgency);
  };
  const deleteAgency = () => {
    const updatedArray = agency.filter((row) => row.id !== activeRow.id);
    setAgency(updatedArray);
    if (activeRow.id === agency[0]?.id) {
      setActiveRow(agency[1]);
    } else {
      setActiveRow(agency[0]);
    }
  };
  const editHandle = (updatedObject) => {
    const targetRow = agency.find((c) => c.id === updatedObject.id);
    const copyRow = {
      ...targetRow,
      agency: updatedObject.agency,
      area: updatedObject.area,
    };

    setActiveRow(copyRow);
    setAgency(agency.map((obj) => (obj.id === copyRow.id ? copyRow : obj)));
  };
  const handleOk = () => {
    setIsModalOpen(false);
  };
  const handleCancel = () => {
    setIsModalOpen(false);
  };
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
        controlBar={
          <ToggleModal
            section="Verwaltungsbereiche"
            name="Dienststellen"
            addRow={addAgency}
            deleteActiveRow={deleteAgency}
          >
            <ModalForm
              updateHandle={editHandle}
              customFields={[
                {
                  title: "Dienststelle",
                  value: activeRow?.agency,
                  id: nanoid(),
                  name: "agency",
                },
                {
                  title: "Fläche in m²",
                  value: activeRow?.area,
                  id: nanoid(),
                  name: "area",
                },
              ]}
              formName={activeRow?.id}
            />
          </ToggleModal>
        }
      >
        <div className="relative">
          <TableCustom
            columns={columns}
            data={agency}
            activeRow={activeRow}
            setActiveRow={setActiveRow}
            fixHeight={true}
            selectedFeatureKey={"selectedGeom"}
          />
        </div>
      </InfoBlock>
      <Modal
        title={verwaltung.dienststellen.modalTitle}
        open={isModalOpen}
        onOk={handleOk}
        onCancel={handleCancel}
        wrapClassName="history-modal-wrapper"
        okButtonProps={{ style: { display: "none" } }}
        bodyStyle={{ backgroundColor: "#f1f1f1" }}
        cancelText="Schließen"
        centered
      >
        <div style={{ border: "1px solid #CFD8DC" }}>
          {history &&
            history.map((h, idx) => {
              return (
                <div key={h.id}>
                  <div
                    className="flex gap-8 p-2"
                    style={{
                      borderBottom:
                        idx !== history.length - 1 ? "1px solid #CFD8DC" : "0",
                    }}
                  >
                    <div className="max-w-[190px] mt-2 grow">
                      {h.changedDate && h.editorName
                        ? `Änderung am ${h.changedDate} von ${h.editorName}`
                        : "Benutzer und Datum der Änderung unbekannt"}
                    </div>
                    <Table
                      columns={historyColumns}
                      dataSource={h.agencyData}
                      pagination={false}
                      className="w-full max-w-[262px]"
                    />
                  </div>
                </div>
              );
            })}
        </div>
      </Modal>
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
