import { Button, Modal, Switch } from "antd";
import { useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { showDialog } from "../../../core/store/slices/app";
import { getJWT } from "../../../core/store/slices/auth";

import {
  loadObjects,
  setFilter,
} from "../../../core/store/slices/featureCollection";

const Filter = ({ filterStateFromRedux, refRoutedMap }) => {
  const dispatch = useDispatch();
  const jwt = useSelector(getJWT);

  const [filterState, setFilterState] = useState(filterStateFromRedux);
  return (
    <Modal
      style={{ top: 40, left: -200 }}
      zIndex={30000001}
      title={
        <>
          <div>Objekte filtern</div>
        </>
      }
      visible={true}
      onCancel={() => {
        dispatch(showDialog());
      }}
      footer={[
        <Button
          onClick={() => {
            dispatch(showDialog());
          }}
        >
          Ok
        </Button>,
      ]}
    >
      <div>
        <div>
          Wählen Sie hier die Objektarten an, die Sie in der Karte anzeigen
          möchten:
        </div>
        <p key={JSON.stringify(filterState)} style={{ marginTop: 20 }}>
          {Object.keys(filterState).map((key) => {
            const item = filterState[key];
            return (
              <Switch
                key={key + "Switch"}
                checkedChildren={item.title}
                unCheckedChildren={item.title}
                style={{ margin: 5 }}
                onChange={(switched) => {
                  const _fs = JSON.parse(JSON.stringify(filterState));
                  _fs[key].enabled = switched;
                  dispatch(setFilter(_fs));
                  setFilterState(_fs);
                  setTimeout(() => {
                    dispatch(
                      loadObjects({
                        boundingBox: refRoutedMap.current.getBoundingBox(),
                        overridingFilterState: _fs,
                        force: true,
                        jwt: jwt,
                      })
                    );
                  }, 50);
                }}
                checked={item.enabled}
              />
            );
          })}
        </p>
      </div>
    </Modal>
  );
};

export default Filter;
