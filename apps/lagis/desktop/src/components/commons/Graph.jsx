import React, { useCallback, useState, useEffect } from "react";
import { Card } from "antd";
import { useSearchParams } from "react-router-dom";
import PropTypes from "prop-types";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faBars } from "@fortawesome/free-solid-svg-icons";
import ReactFlow, {
  addEdge,
  ConnectionLineType,
  useNodesState,
  useEdgesState,
  ReactFlowProvider,
  Controls,
} from "reactflow";
import dagre from "dagre";
import "reactflow/dist/style.css";
import "./graph.css";
const dagreGraph = new dagre.graphlib.Graph();
dagreGraph.setDefaultEdgeLabel(() => ({}));

const nodeWidth = 172;
const nodeHeight = 36;

const getLayoutedElements = (nodes, edges, direction = "TB") => {
  const isHorizontal = direction === "LR";
  dagreGraph.setGraph({ rankdir: direction });

  nodes.forEach((node) => {
    dagreGraph.setNode(node.id, { width: nodeWidth, height: nodeHeight });
  });

  edges.forEach((edge) => {
    dagreGraph.setEdge(edge.source, edge.target);
  });

  dagre.layout(dagreGraph);

  nodes.forEach((node) => {
    const nodeWithPosition = dagreGraph.node(node.id);
    node.targetPosition = isHorizontal ? "left" : "top";
    node.sourcePosition = isHorizontal ? "right" : "bottom";

    // We are shifting the dagre node position (anchor=center center) to the top left
    // so it matches the React Flow node anchor point (top left).
    node.position = {
      x: nodeWithPosition.x - nodeWidth / 2,
      y: nodeWithPosition.y - nodeHeight / 2,
    };

    return node;
  });

  return { nodes, edges };
};

const addStyleBylickedNode = (node, active) => {
  console.log("root node", node.id, node.id.startsWith("pseudo"));
  if (active && !node.id.startsWith("pseudo")) {
    return {
      ...node,
      style: { background: "#E1F1FF" },
    };
  } else {
    if (node.data.root) {
      return {
        ...node,
        style: { background: "#f5f5f5" },
      };
    }
    return {
      ...node,
      style: { ...node.style, background: "white" },
    };
  }
};

const Graph = ({
  dataIn,
  extractor,
  rootObjectText,
  width = 1000,
  height = 500,
  historyHalten,
  firstDarstellung,
  secondDarstellung,
  numberBegrenzteTiefe,
  historieHaltenCheckbox,
  historieHaltenRootText,
}) => {
  const data = extractor(dataIn);
  const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(
    data ? data.initialNodesData : [],
    data ? data.initialEdgesData : []
  );
  const [nodes, setNodes, onNodesChange] = useNodesState(layoutedNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(layoutedEdges);
  const handleNodeClick = (event, node) => {
    if (!node.id.startsWith("pseudo")) {
      handleUrlParams(node.data.label);
    }
    if (historieHaltenCheckbox) {
      const updatedNodeArr = nodes.map((n) => {
        if (n.id === node.id) {
          return addStyleBylickedNode(n, true);
        } else {
          return addStyleBylickedNode(n, false);
        }
      });
      setNodes(updatedNodeArr);
    }
  };

  const onConnect = useCallback(
    (params) =>
      setEdges((eds) =>
        addEdge(
          { ...params, type: ConnectionLineType.SmoothStep, animated: false },
          eds
        )
      ),
    []
  );
  const onLayout = useCallback(
    (direction) => {
      const { nodes: layoutedNodes, edges: layoutedEdges } =
        getLayoutedElements(nodes, edges, direction);

      setNodes([...layoutedNodes]);
      setEdges([...layoutedEdges]);
    },
    [nodes, edges]
  );

  const proOptions = { hideAttribution: true };
  const padding = 5;
  const [urlParams, setUrlParams] = useSearchParams();
  const handleUrlParams = (landParcelString) => {
    const lansParcelParamsArray = landParcelString.split(" ");
    const lansParcelParamsObj = {};
    lansParcelParamsObj.gem = lansParcelParamsArray[0];
    lansParcelParamsObj.flur = lansParcelParamsArray[1];
    lansParcelParamsObj.fstck = lansParcelParamsArray[2].replace(/\//g, "-");
    setUrlParams(lansParcelParamsObj);
  };
  const handleUpdateNodes = (layoutedNodes, layoutedEdges) => {
    setNodes(layoutedNodes);
    setEdges(layoutedEdges);
  };
  useEffect(() => {
    const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(
      data ? data.initialNodesData : [],
      data ? data.initialEdgesData : []
    );
    handleUpdateNodes(layoutedNodes, layoutedEdges);
  }, [
    dataIn,
    firstDarstellung,
    secondDarstellung,
    numberBegrenzteTiefe,
    historyHalten,
  ]);

  return (
    <Card
      size="small"
      hoverable={false}
      title={
        <span>
          <FontAwesomeIcon icon={faBars} /> Graph {rootObjectText}
        </span>
      }
      className="shadow-md"
      style={{
        width: width,
        height: height,
      }}
      bodyStyle={{ padding }}
      headStyle={{ backgroundColor: "white" }}
      type="inner"
    >
      <div style={{ width, height: height - padding * 9 }}>
        <ReactFlowProvider>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onNodeClick={handleNodeClick}
            onConnect={onConnect}
            connectionLineType={ConnectionLineType.SmoothStep}
            proOptions={proOptions}
            fitView
            nodesConnectable={false}
          >
            <Controls
              position="top-left"
              style={{ marginLeft: "8px" }}
            ></Controls>
          </ReactFlow>
        </ReactFlowProvider>
      </div>
    </Card>
  );
};
export default Graph;

Graph.propTypes = {
  /**
   * The width of the map
   */
  width: PropTypes.number,

  /**
   * The height of the map
   */
  height: PropTypes.number,

  /**
   * The current main data object that is being used
   */
  dataIn: PropTypes.array,
  /**
   * The extractor function that is used to transform the dataIn object into the data object
   */
  extractor: PropTypes.func,

  /**
   * The style of the map
   */
  mapStyle: PropTypes.object,

  /**
   * Should the Graph be fitted to the container
   * @type {[type]}
   * @default true
   * @description If true, the map will be fitted to the container
   */
  fit: PropTypes.bool,

  /**
   * Should the Graph be zoomable
   * @default true
   * @type {[type]}
   * @description If true, the map will be zoomable
   */
  zoom: PropTypes.bool,
};
