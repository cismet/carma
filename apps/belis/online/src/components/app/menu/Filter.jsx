import { Switch } from "antd";
import { useState } from "react";
import { useDispatch, useSelector } from "react-redux";

import { getJWT } from "../../../core/store/slices/auth";
import {
  getFilter,
  loadObjects,
  setFilter,
} from "../../../core/store/slices/featureCollection";

const Filter = ({ refRoutedMap }) => {
  // const dexieW = dexieworker();
  const dispatch = useDispatch();

  const jwt = useSelector(getJWT);
  const filterStateFromRedux = useSelector(getFilter);

  const [filterState, setFilterState] = useState(filterStateFromRedux);

  return (
    <div>
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
    </div>
  );
};

export default Filter;
