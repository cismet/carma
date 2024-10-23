import {
  faCheck,
  faDownload,
  faTrash,
} from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon as Icon } from '@fortawesome/react-fontawesome';
import { useWindowSize } from '@react-hook/window-size';
import React, { useContext, useEffect } from 'react';
import Button from 'react-bootstrap/Button';
import { UIDispatchContext } from 'react-cismap/contexts/UIContextProvider';
import { useDispatch, useSelector } from 'react-redux';
import {
  CONNECTIONMODE,
  setConnectionMode,
} from '../../../core/store/slices/app';

import { getJWT, getLoginFromJWT } from '../../../core/store/slices/auth';
import {
  config,
  deleteCacheDB,
  fillCacheInfo,
  getCacheSettings,
  isCacheFullUsable,
  renewCache,
  setCacheUser,
} from '../../../core/store/slices/cacheControl';
import { forceRefresh } from '../../../core/store/slices/featureCollection';
import {
  getHealthState,
  HEALTHSTATUS,
} from '../../../core/store/slices/health';
import { getTeam } from '../../../core/store/slices/team';
import CacheItem from '../cache/CacheItem';

const CacheSettings = () => {
  const dispatch = useDispatch();
  const cacheSettings = useSelector(getCacheSettings);
  const selectedTeam = useSelector(getTeam);
  const healthState = useSelector(getHealthState);
  const cacheReady = useSelector(isCacheFullUsable);
  const cacheReadyRef = React.useRef();
  const { setAppMenuActiveMenuSection } = useContext(UIDispatchContext);

  useEffect(() => {
    cacheReadyRef.current = cacheReady;
  }, [cacheReady]);

  const jwt = useSelector(getJWT);

  useEffect(() => {
    dispatch(fillCacheInfo());
  }, []);

  // eslint-disable-next-line no-unused-vars
  const [width, height] = useWindowSize();

  let secondarySettings = [];
  Object.keys(cacheSettings)
    .filter((key) => cacheSettings[key].primary === undefined)
    .forEach((secondaryKey) => {
      secondarySettings.push(cacheSettings[secondaryKey]);
    });
  let primarySettings = [];
  Object.keys(cacheSettings)
    .filter((key) => cacheSettings[key].primary === true)
    .forEach((primaryKey) => {
      primarySettings.push(cacheSettings[primaryKey]);
    });
  return (
    <div style={{ marginBottom: 5 }}>
      <div>
        <Button
          style={{ margin: 3 }}
          variant="outline-primary"
          size="sm"
          disabled={
            selectedTeam?.id >= 0 && healthState === HEALTHSTATUS.OK
              ? false
              : true
          }
          onClick={() => {
            let index = 0;
            for (const setting of [...primarySettings]) {
              setTimeout(() => {
                console.log('yyy renewCache', setting.key);

                dispatch(renewCache(setting.key, jwt));
              }, 100 + 1000 * index++);
            }
            dispatch(setCacheUser(getLoginFromJWT(jwt)));

            const refreshChecker = setInterval(() => {
              if (cacheReadyRef.current === true) {
                clearInterval(refreshChecker);
                dispatch(forceRefresh());
              } else {
                // console.log("wait");
              }
            }, 100);
          }}
        >
          <Icon icon={faDownload} /> Kompletten Cache neu füllen
        </Button>
        {(selectedTeam?.id === undefined || selectedTeam?.id === -1) && (
          <Button
            style={{ margin: 3 }}
            variant="outline-primary"
            size="sm"
            onClick={() => {
              setAppMenuActiveMenuSection('teams');
            }}
          >
            <Icon icon={faCheck} /> Vor dem Füllen des Cache bitte ein Team
            auswählen
          </Button>
        )}

        {/* <Button disabled style={{ margin: 3 }} variant='outline-success' size='sm'>
          <Icon icon={faSync} /> Nur neue Objekte laden
        </Button> */}

        <Button
          onClick={() => {
            dispatch(setConnectionMode(CONNECTIONMODE.LIVE));
            dispatch(deleteCacheDB());

            setTimeout(() => {
              window.location.reload();
            }, 750);
          }}
          style={{ margin: 3 }}
          variant="outline-danger"
          size="sm"
        >
          <Icon icon={faTrash} /> Cache DB löschen
        </Button>
      </div>
      <table
        border={0}
        style={{
          width: '100%',
          padding: 3,
        }}
      >
        <tbody>
          <tr>
            <td />
            <td
              style={{
                textAlign: 'right',
                paddingLeft: '25px',
                paddingRight: '15px',
                whiteSpace: 'nowrap',
              }}
            >
              # Objekte
            </td>
            <td>Name</td>
            <td
              style={{
                width: 120,
                paddingLeft: '25px',
                paddingRight: '25px',
                whiteSpace: 'nowrap',
              }}
            >
              letzte Aktualisierung
            </td>
          </tr>
          {Object.keys(config).map((key, index) => {
            return (
              <CacheItem
                refreshAllowed={healthState === HEALTHSTATUS.OK}
                key={'CacheItem.' + index}
                config={config[key]}
                info={cacheSettings[key] || {}}
                renew={() => {
                  dispatch(renewCache(key, jwt));
                }}
              />
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

export default CacheSettings;
