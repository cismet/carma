// Evaluate in a warmed Geoportal Mesh2024 + shadows page. Reads the actual mounted
// colour cut after native map renders. Structural evidence, not a pixel certificate.
(async () => {
  const map = window.__carmaMap;
  let t;
  map.style._layers["carma-shared-three-scene"].implementation
    .getRuntimes()
    .find((r) => r.providesTerrain)
    .root.traverse((o) => {
      if (o.isTilesGroup) t = o.tilesRenderer;
    });
  const result = {
    frames: 0,
    gapFrames: 0,
    examples: [],
    initial: map.getZoom(),
    path: [17.165, 14.383, 18, 13.8, 17, 14.383],
  };
  const read = () => {
    result.frames++;
    const cut = new Set(
      [...t.visibleTiles].filter((tile) => {
        const scene = tile.engineData?.scene;
        if (
          !scene ||
          scene.parent !== t.group ||
          !t.group.children.includes(scene)
        )
          return false;
        let color = false;
        scene.traverse((o) => {
          if (
            o.isMesh &&
            (Array.isArray(o.material) ? o.material : [o.material]).some(
              (m) => m.colorWrite && m.visible
            )
          )
            color = true;
        });
        return color;
      })
    );
    const inView = (n) =>
      !n.engineData?.boundingVolume ||
      n.engineData.boundingVolume.intersectsFrustum(t.cameraInfo[0].frustum);
    const cache = new Map();
    const covered = (n) => {
      if (cache.has(n)) return cache.get(n);
      let yes;
      if (!inView(n) || cut.has(n)) yes = true;
      else if (
        !n.internal ||
        (n.internal.hasUnrenderableContent && n.internal.loadingState !== 4)
      )
        yes = false;
      else if (!n.children?.length)
        yes =
          n.internal.hasContent === false && !n.internal.hasRenderableContent;
      else yes = n.children.every(covered);
      cache.set(n, yes);
      return yes;
    };
    const ancestors = new Set();
    for (const tile of cut)
      for (let p = tile.parent; p; p = p.parent) ancestors.add(p);
    for (const p of ancestors) {
      if (
        p.internal?.loadingState !== 4 ||
        !p.internal.hasRenderableContent ||
        !inView(p)
      )
        continue;
      let owned = false;
      for (let a = p; a; a = a.parent)
        if (cut.has(a)) {
          owned = true;
          break;
        }
      if (owned || covered(p)) continue;
      result.gapFrames++;
      if (result.examples.length < 4)
        result.examples.push({
          parent: p.content?.uri,
          zoom: map.getZoom(),
          children: p.children.map((c) => ({
            uri: c.content?.uri,
            state: c.internal?.loadingState,
            inView: inView(c),
            covered: covered(c),
          })),
        });
      break;
    }
  };
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  map.on("render", read);
  try {
    for (const zoom of result.path) {
      map.zoomTo(zoom, { duration: 400 });
      await wait(1800);
    }
  } finally {
    map.off("render", read);
  }
  result.finalZoom = map.getZoom();
  result.resident = t.lruCache.itemList.length;
  window.__gapFinal = result;
  return result;
})();
