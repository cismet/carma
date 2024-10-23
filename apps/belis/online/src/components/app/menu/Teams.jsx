import { useEffect, useState } from 'react';
import Button from 'react-bootstrap/Button';
import { useDispatch, useSelector } from 'react-redux';
//import dexieworker from "workerize-loader!../../../core/workers/dexie"; // eslint-disable-line import/no-webpack-loader-syntax

import {
  CONNECTIONMODE,
  getConnectionMode,
} from '../../../core/store/slices/app';
import { getJWT } from '../../../core/store/slices/auth';
import {
  config,
  getCacheSettings,
  renewCache,
} from '../../../core/store/slices/cacheControl';
import { getWorker } from '../../../core/store/slices/dexie';
import { loadTaskLists } from '../../../core/store/slices/featureCollection';
import { getTeam, setTeam } from '../../../core/store/slices/team';
import CacheItem from '../cache/CacheItem';

const Teams = () => {
  const dispatch = useDispatch();
  const selectedTeam = useSelector(getTeam);
  const cacheSettings = useSelector(getCacheSettings);

  const connectionMode = useSelector(getConnectionMode);
  const dexieW = useSelector(getWorker);
  const [teams, setTeams] = useState([]);
  const jwt = useSelector(getJWT);
  useEffect(() => {
    //async block
    (async () => {
      try {
        const teams = await dexieW.getAll('team');

        if (teams && teams.length > 0) {
          setTeams(teams);
        } else {
          dispatch(renewCache('team', jwt));
        }
      } catch (e) {
        console.log('Error in fetching teams');
      }
    })();
  }, []);

  return (
    <div>
      Bitte wählen Sie das gewünschte Team per Klick auf den Button:
      <div style={{ display: 'flex', flexDirection: 'row', flexWrap: 'wrap' }}>
        {teams &&
          teams.map((team, index) => {
            if (selectedTeam?.id === team.id) {
              return (
                <span key={'buttonspan.' + index} style={{ padding: 3 }}>
                  <Button disabled variant="primary" key={team + index}>
                    {team.name}
                  </Button>
                </span>
              );
            } else {
              return (
                <span key={'buttonspan.' + index} style={{ padding: 3 }}>
                  <Button
                    onClick={() => {
                      if (connectionMode === CONNECTIONMODE.FROMCACHE) {
                        (async () => {
                          const oldTeam = selectedTeam;
                          const oldAAs = await dexieW.getAll('arbeitsauftrag');
                          console.log('TEAMS: ', oldAAs);
                          dispatch(setTeam(team));
                          dispatch(
                            renewCache(
                              'arbeitsauftrag',
                              jwt,
                              { team: { selectedTeam: team } },
                              () => {
                                //success
                                console.log('success');
                                dispatch(
                                  loadTaskLists({
                                    team: team,
                                    jwt,
                                  })
                                );
                              },
                              () => {
                                //error
                                console.log('something went wrong');
                                dexieW.putArray(oldAAs, 'arbeitsauftrag');
                                dispatch(setTeam(oldTeam));
                              }
                            )
                          );
                        })();
                      } else {
                        dispatch(setTeam(team));
                      }
                    }}
                    variant="outline-primary"
                    key={team + index}
                  >
                    {team.name}
                  </Button>
                </span>
              );
            }
          })}
      </div>
      {connectionMode === CONNECTIONMODE.FROMCACHE && (
        <div>
          <hr />
          Wenn Sie ein anderes Team auswählen, wird direkt versucht die
          Arbeitsaufträge in den lokalen Daten zu hinterlegen. Sollte das nicht
          funktionieren, weil Sie momentan keine Verbindung zu unseren Servern
          herstellen können, kann das Team nicht gewechselt werden.
          <hr />
          <CacheItem
            key={'CacheItem.Team.arbeitsauftrag'}
            config={config['arbeitsauftrag']}
            info={cacheSettings['arbeitsauftrag']}
            renew={() => {
              dispatch(renewCache('arbeitsauftrag', jwt));
            }}
          />
          <hr />
        </div>
      )}
    </div>
  );
};

export default Teams;
