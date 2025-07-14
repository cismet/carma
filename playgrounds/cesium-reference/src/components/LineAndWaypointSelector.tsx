import { useState, useEffect } from "react";
import { Button, Select, Divider } from "antd";
import { GeoJsonDataSource } from "cesium";
import {
  idToLinewayPoint,
  linewayPointToId,
} from "../views/obliqueAndMesh.utils";

const LineAndWaypointSelector = ({
  id,
  waypointsDataSource,
  setId,
}: {
  id: string;
  waypointsDataSource: GeoJsonDataSource;
  setId: (id: string) => void;
}) => {
  const [lineOptions, setLineOptions] = useState<
    { label: string; value: string }[]
  >([]);
  const [waypointOptions, setWaypointOptions] = useState<
    { label: string; value: string }[]
  >([]);
  const [selectedLine, setSelectedLine] = useState<string | null>(null);
  const [selectedWaypoint, setSelectedWaypoint] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    const { line, waypoint } = idToLinewayPoint(id);
    setSelectedLine(line);
    setSelectedWaypoint(waypoint);
  }, [id]);

  useEffect(() => {
    if (
      !waypointsDataSource ||
      waypointsDataSource.entities.values.length === 0
    )
      return;
    const linesWithFootprints = new Set<string>(
      waypointsDataSource.entities.values
        .filter(
          ({ properties }) =>
            properties &&
            properties.hasProperty("LINE") &&
            properties.hasProperty("HAS_FOOTPRINT") &&
            properties.HAS_FOOTPRINT.getValue()
        )
        .map(({ properties }) => properties.LINE.getValue())
    );

    const lineOpts = Array.from(linesWithFootprints).map((line) => ({
      label: line,
      value: line,
    }));
    setLineOptions(lineOpts);
  }, [waypointsDataSource]);

  useEffect(() => {
    if (selectedLine && waypointsDataSource.entities.values.length > 0) {
      const waypoints = new Set<string>(
        waypointsDataSource.entities.values
          .filter(
            ({ properties }) =>
              properties &&
              properties.hasProperty("LINE") &&
              properties.hasProperty("WAYPOINT") &&
              properties.LINE.getValue() === selectedLine &&
              properties.hasProperty("HAS_FOOTPRINT") &&
              properties.HAS_FOOTPRINT.getValue()
          )
          .map(({ properties }) => properties.WAYPOINT.getValue())
      );
      const waypointOpts = Array.from(waypoints)
        .sort()
        .map((key) => ({
          label: key,
          value: key,
        }));
      setWaypointOptions(waypointOpts);
    }
  }, [selectedLine, waypointsDataSource]);

  if (!waypointsDataSource) {
    return null;
  }

  const handleLineIncrement = (increment: number) => {
    const currentIndex = lineOptions.findIndex(
      (option) => option.value === selectedLine
    );
    const newIndex =
      (currentIndex + increment + lineOptions.length) % lineOptions.length;
    const newLine = lineOptions[newIndex].value;
    setSelectedLine(newLine);
    updateSelectedId(newLine, selectedWaypoint);
  };

  const handleWaypointIncrement = (increment: number) => {
    const currentIndex = waypointOptions.findIndex(
      (option) => option.value === selectedWaypoint
    );
    const newIndex =
      (currentIndex + increment + waypointOptions.length) %
      waypointOptions.length;
    const newWaypoint = waypointOptions[newIndex].value;
    setSelectedWaypoint(newWaypoint);
    updateSelectedId(selectedLine, newWaypoint);
  };

  const updateSelectedId = (line: string, waypoint: string) => {
    setId(linewayPointToId(line, waypoint));
  };

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
      <Button onClick={() => handleLineIncrement(-1)}>-</Button>
      <Select
        style={{ width: 200 }}
        options={lineOptions}
        onChange={(value) => {
          setSelectedLine(value);
          updateSelectedId(value, selectedWaypoint);
        }}
        value={selectedLine}
        placeholder="Select Line"
      />
      <Button onClick={() => handleLineIncrement(1)}>+</Button>
      <Divider type="vertical" />
      <Button onClick={() => handleWaypointIncrement(-1)}>-</Button>
      <Select
        style={{ width: 200 }}
        options={waypointOptions}
        onChange={(value) => {
          setSelectedWaypoint(value);
          updateSelectedId(selectedLine, value);
        }}
        value={selectedWaypoint}
        placeholder="Select Waypoint"
      />
      <Button onClick={() => handleWaypointIncrement(1)}>+</Button>
    </div>
  );
};

export default LineAndWaypointSelector;
