import { Button, Modal, Switch } from "antd";
import { useDispatch, useSelector } from "react-redux";
import { getFilter, setFilter } from "../../store/slices/featureCollection";
import { useState } from "react";
import { FontAwesomeIcon as Icon } from "@fortawesome/react-fontawesome";
import { faFilter } from "@fortawesome/free-solid-svg-icons";

const Filter = () => {
  const dispatch = useDispatch();
  const filterStateFromRedux = useSelector(getFilter);
  const [filterState, setFilterState] = useState(filterStateFromRedux);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const showModal = () => {
    setIsModalOpen(true);
  };

  const handleOk = () => {
    setIsModalOpen(false);
  };

  const handleCancel = () => {
    setIsModalOpen(false);
  };
  return (
    <>
      <div onClick={showModal} className="mr-2">
        <Icon color="#007bff" icon={faFilter} /> Filter (
        {Object.entries(
          filterState as Record<string, { enabled: boolean }>
        ).reduce((prev, curr) => {
          if (curr[1]?.enabled) {
            return prev + 1;
          } else {
            return prev;
          }
        }, 0)}
        /{Object.entries(filterState).length})
      </div>
      <Modal
        zIndex={30000001}
        title={
          <>
            <div>Objekte filtern</div>
          </>
        }
        open={isModalOpen}
        onCancel={handleCancel}
        footer={[<Button onClick={handleOk}>Ok</Button>]}
      >
        <div>
          <div className="mb-4">
            Wählen Sie hier die Objektarten an, die Sie in der Karte anzeigen
            möchten:
          </div>
          {Object.keys(filterState).map((key) => {
            const item = filterState[key];
            return (
              <Switch
                key={key + "Switch"}
                checkedChildren={item.title}
                unCheckedChildren={item.title}
                style={{ marginTop: "0.6rem", marginRight: "0.5rem" }}
                onChange={(switched) => {
                  const _fs = JSON.parse(JSON.stringify(filterState));
                  _fs[key].enabled = switched;
                  dispatch(setFilter(_fs));
                  setFilterState(_fs);
                }}
                checked={item.enabled}
              />
            );
          })}
        </div>
      </Modal>
    </>
  );
};

export default Filter;
