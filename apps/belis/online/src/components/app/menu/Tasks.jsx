import { Button, Table, Typography } from "antd";
import { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { FontAwesomeIcon as Icon } from "@fortawesome/react-fontawesome";
import {
  faRedo,
} from "@fortawesome/free-solid-svg-icons";
import { downloadTasks, getTasks, resyncDb, setSyncPoint } from "../../../core/store/slices/offlineActionDb";

const Tasks = () => {
  const dispatch = useDispatch();
  const tasks = useSelector(getTasks);
  const [showAll, setShowAll] = useState(false);
  const [shownTasks, setShownTasks] = useState([]);

  useEffect(() => {
    let results;

    if (showAll) {
      results = tasks.slice().sort((a, b) => {
        return new Date(b.datum).getTime() - new Date(a.datum).getTime();
      });
    } else {
      const now = new Date().getTime();

      results = tasks.filter((result) => {
        return (
          result.statusCode !== 200 ||
          now - new Date(result.datum).getTime() < 1000 * 60 * 60 * 24 * 3
        ); // 3 days
      });
      results = results.sort((a, b) => {
        return new Date(b.datum).getTime() - new Date(a.datum).getTime();
      });
    }
    setShownTasks(results);
  }, [showAll, tasks]);

  const iconSize = 23;
  const columns = [
    {
      title: "Aktion",
      dataIndex: "aktion",
      key: "aktion",
      align: "center",
      render: (x) => (
        <Typography.Text style={{ fontSize: iconSize, color: "grey" }}>{x}</Typography.Text>
      ),
    },

    {
      title: "Datum",
      dataIndex: "datum",
      key: "datum",
      render: (date) => <div onClick={(e) => {dispatch(setSyncPoint(new Date(new Date(date).getTime() - 100)));}}>{new Date(date).toLocaleString()} </div>,
    },
    { title: "Fachobjekt", dataIndex: "fachobjekt", key: "fachobjekt" },
    { title: "Beschreibung", dataIndex: "beschreibung", key: "beschreibung" },
    {
      title: "Status",
      dataIndex: "status",
      key: "status",
      align: "center",
      render: (x, record) => <Typography.Text style={{ fontSize: iconSize }}>{x}</Typography.Text>,
    },
  ];

  return (
    <div>
      <Button
        style={{ float: "right", marginLeft: 10, marginBottom: 10 }}
        onClick={() => {
          dispatch(resyncDb());
        }}
      >
        Sync Mechanismus neu starten
      </Button>
      {showAll && (
        <Button style={{ float: "right", marginBottom: 10 }} onClick={() => setShowAll(!showAll)}>
          Nur Fehler und letzte Aktionen anzeigen
        </Button>
      )}
      {!showAll && (
        <Button style={{ float: "right", marginBottom: 10 }} onClick={() => setShowAll(!showAll)}>
          Alle Aktionen anzeigen
        </Button>
      )}
      <Table
        locale={{ emptyText: "-" }}
        rowKey='id'
        key={"table." + showAll}
        dataSource={shownTasks}
        columns={columns}
      />
      <p>
        Mit diesem{" "}
        <a
          className='renderAsLink'
          onClick={() => {
            dispatch(downloadTasks());
          }}
        >
          Link
        </a>{" "}
        können Sie den lokalen Abzug der Tasks herunterladen. (Große Datei)
      </p>
    </div>
  );
};

export default Tasks;
