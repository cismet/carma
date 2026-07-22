#!/usr/bin/env node

import { resolve } from "node:path";

import { Copc } from "copc";
import { LazPerf } from "laz-perf";

const args = process.argv.slice(2);
const maxNodesIndex = args.indexOf("--max-nodes");
const maxNodes =
  maxNodesIndex >= 0 ? Number.parseInt(args[maxNodesIndex + 1] ?? "", 10) : null;
if (maxNodesIndex >= 0) args.splice(maxNodesIndex, 2);
const file = args[0] ? resolve(args[0]) : null;
if (!file) {
  throw new Error("Usage: copc-field-stats.mjs [--max-nodes N] FILE");
}
if (maxNodes !== null && (!Number.isInteger(maxNodes) || maxNodes < 1)) {
  throw new Error("--max-nodes must be a positive integer");
}

const collectNodes = async (copc) => {
  const pages = [copc.info.rootHierarchyPage];
  const nodes = [];
  while (pages.length > 0) {
    const subtree = await Copc.loadHierarchyPage(file, pages.shift());
    for (const node of Object.values(subtree.nodes)) {
      if (node?.pointCount) nodes.push(node);
    }
    for (const page of Object.values(subtree.pages)) {
      if (page) pages.push(page);
    }
  }
  return nodes;
};

const [copc, lazPerf] = await Promise.all([
  Copc.create(file),
  LazPerf.create(),
]);
const allNodes = await collectNodes(copc);
const nodes =
  maxNodes !== null && allNodes.length > maxNodes
    ? Array.from({ length: maxNodes }, (_, index) =>
        allNodes[Math.floor((index * allNodes.length) / maxNodes)]
      )
    : allNodes;
const firstView = await Copc.loadPointDataView(file, copc, nodes[0], {
  lazPerf,
});
const names = Object.keys(firstView.dimensions);
const statistics = Object.fromEntries(
  names.map((name) => [name, { min: Infinity, max: -Infinity, nonzero: 0 }])
);
let scannedPointCount = 0;

for (let nodeIndex = 0; nodeIndex < nodes.length; nodeIndex++) {
  const view =
    nodeIndex === 0
      ? firstView
      : await Copc.loadPointDataView(file, copc, nodes[nodeIndex], { lazPerf });
  const getters = names.map((name) => view.getter(name));
  for (let pointIndex = 0; pointIndex < view.pointCount; pointIndex++) {
    for (
      let dimensionIndex = 0;
      dimensionIndex < names.length;
      dimensionIndex++
    ) {
      const value = getters[dimensionIndex](pointIndex);
      const statistic = statistics[names[dimensionIndex]];
      statistic.min = Math.min(statistic.min, value);
      statistic.max = Math.max(statistic.max, value);
      if (value !== 0) statistic.nonzero++;
    }
  }
  scannedPointCount += view.pointCount;
}

process.stdout.write(
  `${JSON.stringify(
    {
      file,
      headerPointCount: copc.header.pointCount,
      scannedPointCount,
      scannedNodeCount: nodes.length,
      totalNodeCount: allNodes.length,
      exact: nodes.length === allNodes.length,
      pointDataRecordFormat: copc.header.pointDataRecordFormat,
      pointDataRecordLength: copc.header.pointDataRecordLength,
      wkt: copc.wkt ?? null,
      dimensions: names.map((name) => ({ name, ...statistics[name] })),
    },
    null,
    2
  )}\n`
);
