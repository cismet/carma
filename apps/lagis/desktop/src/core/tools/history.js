export const generateGraphObj = (
  histObj,
  rootText,
  firstDarstellung,
  secondDarstellung,
  begrenzteTiefe,
  historieHaltenRootText,
  historyHalten,
  historyHaltenArr
) => {
  if (histObj === undefined) {
    return { initialNodesData: [], initialEdgesData: [] };
  }
  const position = { x: 0, y: 0 };
  // bezier, straight, step
  const edgeType = "bezier";
  const historyData = historyHalten ? historyHaltenArr : histObj;
  const addedNodes = new Set();

  const initialNodes = [];
  const initialEdgesData = [];
  const initialObject = historyHalten ? historieHaltenRootText : rootText;

  historyData.forEach((item, idx) => {
    const { nachfolger_name, vorgaenger_name, level } = item;
    if (level < 1 && secondDarstellung === "Nachfolger") {
      if (historyData.length - 1 === idx && initialNodes.length === 0) {
        initialNodes.push({
          id: vorgaenger_name.replace(/\s/g, ""),
          data: {
            label: initialObject,
            root: true,
          },
          position,
          style: {},
        });
      }
      return;
    }

    if (level > 0 && secondDarstellung === "Vorgänger") {
      return;
    }

    if (level != 0 && level != 1 && firstDarstellung === "Direkte") {
      return;
    }

    if (
      (level > begrenzteTiefe || level <= -1 * begrenzteTiefe) &&
      firstDarstellung === "Begrenzte"
    ) {
      return;
    }

    const nodeStyle = {};
    if (!addedNodes.has(vorgaenger_name)) {
      initialNodes.push({
        id: vorgaenger_name.replace(/\s/g, ""),
        data: {
          label: vorgaenger_name.startsWith("pseudo ")
            ? "   "
            : vorgaenger_name,
          root: vorgaenger_name === initialObject,
        },
        position,
        style: {},
      });

      addedNodes.add(vorgaenger_name);
    }

    if (!addedNodes.has(nachfolger_name)) {
      if (nachfolger_name.startsWith("pseudo ")) {
        nodeStyle.width = 40;
      }
      initialNodes.push({
        id: nachfolger_name.replace(/\s/g, ""),
        data: {
          label: nachfolger_name.startsWith("pseudo ")
            ? "   "
            : nachfolger_name,
          root: nachfolger_name === initialObject,
        },
        position,
        style: nodeStyle,
      });

      addedNodes.add(nachfolger_name);
    }

    if (vorgaenger_name !== nachfolger_name) {
      initialEdgesData.push({
        id: idx,
        source: vorgaenger_name.replace(/\s/g, ""),
        target: nachfolger_name.replace(/\s/g, ""),
        type: edgeType,
        animated: false,
      });
    }
  });

  if (initialNodes.length === 0) {
    initialNodes.push({
      id: initialObject.replace(/\s/g, ""),
      data: {
        label: initialObject,
        root: true,
      },
      position,
      style: {},
    });
  }

  const addStyleToRootNode = initialNodes.find((n) =>
    historyHalten ? n.data?.label === historieHaltenRootText : n.data?.root
  );

  if (addStyleToRootNode) {
    addStyleToRootNode.style = { background: "#E1F1FF" };
  } else {
  }

  const sourceArr = [];
  const edArr = [];
  initialNodes.forEach((n) => {
    initialEdgesData.forEach((eg) => {
      if (eg.source === n.id) {
        sourceArr.push(n.id);
      }
      if (eg.target === n.id) {
        edArr.push(n.id);
      }
    });
  });
  const initialNodesData = initialNodes.map((n) => {
    if (initialNodes.length === 1) {
      return { ...n, className: "single-node" };
    }
    if (sourceArr.includes(n.id) && edArr.includes(n.id)) {
      return n;
    } else {
      if (sourceArr.includes(n.id) && !edArr.includes(n.id)) {
        return { ...n, type: "input" };
      }
      return { ...n, type: "output" };
    }
  });

  return { initialNodesData, initialEdgesData };
};
