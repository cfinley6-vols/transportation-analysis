// Positions for the network map.
//
// Each intersection's position on the city map is stored in the database
// (MapX/MapY, in blocks), and the map scales those positions to fit the view.
// An intersection without a stored position waits in a row along the bottom
// until it is moved onto the map. If no intersection has a position at all,
// the map is drawn from the street network instead: intersections are placed
// so that screen distance matches the number of blocks between them.

export const VIEW = { width: 1000, height: 600, padding: 60 };

/**
 * Shared by every map on screen. `version` changes whenever positions are
 * recomputed (maps rebuild their roads).
 */
export const layout = { signature: "", positions: new Map(), version: 0, toBlocks: null };

/**
 * Every road on the map: segments between consecutive intersections of a
 * route (with the routes using each), plus roads built without a route
 * (`road` is that road's ID).
 */
export function networkEdges(network) {
  const edges = new Map();
  for (const road of network.roads || []) {
    edges.set(`${road.a}-${road.b}`, { a: road.a, b: road.b, routes: [], road: road.ID });
  }
  for (const route of network.routes) {
    for (let i = 1; i < route.Path.length; i++) {
      const a = Math.min(route.Path[i - 1].id, route.Path[i].id);
      const b = Math.max(route.Path[i - 1].id, route.Path[i].id);
      const key = `${a}-${b}`;
      if (!edges.has(key)) edges.set(key, { a, b, routes: [] });
      edges.get(key).routes.push(route.ID);
    }
  }
  return edges;
}

/** Recompute positions only when the set of intersections or segments changes. */
export function updateLayout(network) {
  const nodes = network.intersections;
  const edges = [...networkEdges(network).values()];
  const signature = `${nodes.map((n) => `${n.ID}:${n.MapX ?? ""},${n.MapY ?? ""}`).join(";")}|${edges.map((e) => `${e.a}-${e.b}`).join(",")}`;
  if (signature === layout.signature) return;
  layout.signature = signature;

  const placed = nodes.filter((n) => n.MapX !== null && n.MapX !== undefined);
  if (placed.length) {
    const fit = fitToView(placed.map((n) => ({ id: n.ID, x: n.MapX, y: n.MapY })), { trayRow: placed.length < nodes.length });
    layout.positions = fit.positions;
    layout.toBlocks = fit.toBlocks;
    // Not yet placed: a row along the bottom edge.
    nodes.filter((n) => !fit.positions.has(n.ID)).forEach((n, i) => {
      layout.positions.set(n.ID, { x: VIEW.padding + i * 80, y: VIEW.height - 34, unplaced: true });
    });
  } else {
    const fit = fitToView(streetLayout(nodes, edges));
    layout.positions = fit.positions;
    layout.toBlocks = fit.toBlocks;
  }
  layout.version++;
}

/**
 * Stress majorization: place intersections so that the distance between any
 * two on screen matches how many road segments apart they are. A street grid
 * comes out as a grid. Starts from classical MDS (no randomness), so the same
 * network always gives the same picture.
 */
function streetLayout(nodes, edges) {
  const n = nodes.length;
  if (n === 0) return [];
  if (n === 1) return [{ id: nodes[0].ID, x: 0, y: 0 }];
  const index = new Map(nodes.map((node, i) => [node.ID, i]));
  const neighbors = nodes.map(() => []);
  for (const e of edges) {
    const i = index.get(e.a), j = index.get(e.b);
    if (i === undefined || j === undefined) continue;
    neighbors[i].push(j);
    neighbors[j].push(i);
  }

  // Blocks between every pair (breadth-first search). Separate pieces of the
  // network are kept one block beyond the farthest connected pair.
  const D = nodes.map((_, start) => {
    const dist = new Array(n).fill(Infinity);
    dist[start] = 0;
    const queue = [start];
    for (let q = 0; q < queue.length; q++) {
      for (const k of neighbors[queue[q]]) if (dist[k] === Infinity) { dist[k] = dist[queue[q]] + 1; queue.push(k); }
    }
    return dist;
  });
  const finite = D.flat().filter(Number.isFinite);
  const far = Math.max(...finite) + 1;
  for (const row of D) row.forEach((d, j) => { if (d === Infinity) row[j] = far; });

  let X = classicalMds(D);
  // Guttman transform, weighted by 1/d^2 so nearby intersections matter most.
  for (let iter = 0; iter < 300; iter++) {
    const next = X.map(() => [0, 0]);
    for (let i = 0; i < n; i++) {
      let wsum = 0;
      for (let j = 0; j < n; j++) {
        if (i === j) continue;
        const w = 1 / (D[i][j] * D[i][j]);
        const dx = X[i][0] - X[j][0], dy = X[i][1] - X[j][1];
        const len = Math.hypot(dx, dy) || 1e-9;
        next[i][0] += w * (X[j][0] + D[i][j] * dx / len);
        next[i][1] += w * (X[j][1] + D[i][j] * dy / len);
        wsum += w;
      }
      next[i][0] /= wsum;
      next[i][1] /= wsum;
    }
    X = next;
  }

  // Turn the picture so most streets run straight across or straight up and down.
  let s = 0, c = 0;
  for (const e of edges) {
    const i = index.get(e.a), j = index.get(e.b);
    if (i === undefined || j === undefined) continue;
    const angle = Math.atan2(X[j][1] - X[i][1], X[j][0] - X[i][0]);
    s += Math.sin(4 * angle);
    c += Math.cos(4 * angle);
  }
  const turn = -Math.atan2(s, c) / 4;
  const [sin, cos] = [Math.sin(turn), Math.cos(turn)];
  let points = X.map(([x, y], i) => ({ id: nodes[i].ID, x: x * cos - y * sin, y: x * sin + y * cos }));

  // Wide rather than tall, to fit the map's frame.
  const span = (key) => Math.max(...points.map((p) => p[key])) - Math.min(...points.map((p) => p[key]));
  if (span("y") > span("x")) points = points.map((p) => ({ id: p.id, x: p.y, y: -p.x }));
  return points;
}

/** Classical multidimensional scaling: a starting picture from the distance table. */
function classicalMds(D) {
  const n = D.length;
  const sq = D.map((row) => row.map((d) => d * d));
  const rowMean = sq.map((row) => row.reduce((a, b) => a + b, 0) / n);
  const allMean = rowMean.reduce((a, b) => a + b, 0) / n;
  const B = sq.map((row, i) => row.map((d, j) => -0.5 * (d - rowMean[i] - rowMean[j] + allMean)));

  // The two largest eigenvectors, by power iteration with fixed starting vectors.
  const vectors = [];
  for (let k = 0; k < 2; k++) {
    let v = Array.from({ length: n }, (_, i) => (k === 0 ? 1 + i / n : Math.cos(i + 1)));
    let lambda = 0;
    for (let iter = 0; iter < 200; iter++) {
      let w = B.map((row) => row.reduce((sum, b, j) => sum + b * v[j], 0));
      for (const [u, l] of vectors) { // remove the direction already found
        const dot = w.reduce((sum, x, i) => sum + x * u[i], 0);
        w = w.map((x, i) => x - dot * u[i]);
        void l;
      }
      const norm = Math.hypot(...w) || 1;
      lambda = norm;
      v = w.map((x) => x / norm);
    }
    vectors.push([v, lambda]);
  }
  return Array.from({ length: n }, (_, i) =>
    vectors.map(([v, lambda]) => v[i] * Math.sqrt(Math.max(lambda, 1e-9))).concat([0]).slice(0, 2));
}

/**
 * Scale and center points (measured in blocks) into the view; a block is at
 * most 170 px. Returns the positions and toBlocks(px) for the reverse.
 * `trayRow` keeps the bottom strip free for intersections not yet placed.
 */
function fitToView(points, { trayRow = false } = {}) {
  const xs = points.map((p) => p.x), ys = points.map((p) => p.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const scale = Math.min(
    (VIEW.width - 2 * VIEW.padding) / Math.max(maxX - minX, 0.01),
    (VIEW.height - 2 * VIEW.padding - (trayRow ? 70 : 0)) / Math.max(maxY - minY, 0.01),
    170,
  );
  const midX = (minX + maxX) / 2, midY = (minY + maxY) / 2;
  const centerY = VIEW.height / 2 - (trayRow ? 35 : 0);
  return {
    positions: new Map(points.map((p) => [p.id, {
      x: VIEW.width / 2 + (p.x - midX) * scale,
      y: centerY + (p.y - midY) * scale,
    }])),
    toBlocks: ({ x, y }) => ({ x: midX + (x - VIEW.width / 2) / scale, y: midY + (y - centerY) / scale }),
  };
}
