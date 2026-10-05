import PropTypes from "prop-types";
import { Modal, Table } from "antd";
import "../../components/ui/control-board/toggle.css";
import { verwaltung } from "@carma-collab/wuppertal/lagis-desktop";

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

const AgenciesHistoryModal = ({ open, onClose, history }) => (
  <Modal
    title={verwaltung.dienststellen.modalTitle}
    open={open}
    onOk={onClose}
    onCancel={onClose}
    wrapClassName="history-modal-wrapper"
    okButtonProps={{ style: { display: "none" } }}
    bodyStyle={{ backgroundColor: "#f1f1f1" }}
    cancelText="Schließen"
    centered
  >
    <div style={{ border: "1px solid #CFD8DC" }}>
      {history &&
        history.map((h, idx) => (
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
        ))}
    </div>
  </Modal>
);

export default AgenciesHistoryModal;

AgenciesHistoryModal.propTypes = {
  open: PropTypes.bool,
  onClose: PropTypes.func,
  history: PropTypes.array,
};
