// Positions for the network map.
//
// Intersections have no coordinates in the database, so the map is a
// schematic: a force-directed layout of the route network, grouped by
// neighborhood. It starts from fixed positions, so the same data always
// gives the same picture. Positions are display-only and never saved.

export const VIEW = { width: 1000, height: 600, padding: 115 };

/**
 * Shared by every map on screen. `version` changes whenever positions are
 * recomputed (maps rebuild their roads).
 */
export const layout = { signature: "", positions: new Map(), version: 0 };

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
  const signature = `${nodes.map((n) => `${n.ID}:${n.Neighborhood || ""}`).join(",")}|${edges.map((e) => `${e.a}-${e.b}`).join(",")}`;
  if (signature === layout.signature) return;
  layout.signature = signature;
  layout.positions = fitToView(simulate(nodes, edges));
  layout.version++;
}

function simulate(nodes, edges) {
  // Start on a circle, sorted by neighborhood, with a small fixed offset.
  const order = [...nodes].sort((x, y) => (x.Neighborhood || "").localeCompare(y.Neighborhood || "") || x.ID - y.ID);
  const points = order.map((n, i) => {
    const angle = (2 * Math.PI * i) / Math.max(order.length, 1);
    return { id: n.ID, hood: n.Neighborhood || "", x: Math.cos(angle) * 220 + ((i * 37) % 11), y: Math.sin(angle) * 220 + ((i * 53) % 7) };
  });
  const index = new Map(points.map((p, i) => [p.id, i]));

  // Springs: [i, j, rest length, stiffness]. Route segments pull hardest;
  // intersections in the same neighborhood pull together gently.
  const springs = edges.map((e) => [index.get(e.a), index.get(e.b), 150, 0.06]);
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      if (points[i].hood && points[i].hood === points[j].hood) springs.push([i, j, 110, 0.025]);
    }
  }

  const ITERATIONS = 500;
  for (let step = 0; step < ITERATIONS; step++) {
    const cooling = 1 - step / ITERATIONS;
    const force = points.map(() => ({ x: 0, y: 0 }));

    // Every pair repels.
    for (let i = 0; i < points.length; i++) {
      for (let j = i + 1; j < points.length; j++) {
        const dx = points[j].x - points[i].x, dy = points[j].y - points[i].y;
        const d2 = Math.max(dx * dx + dy * dy, 100), d = Math.sqrt(d2), f = 16000 / d2;
        force[i].x -= (dx / d) * f; force[i].y -= (dy / d) * f;
        force[j].x += (dx / d) * f; force[j].y += (dy / d) * f;
      }
    }
    for (const [i, j, rest, k] of springs) {
      const dx = points[j].x - points[i].x, dy = points[j].y - points[i].y;
      const d = Math.max(Math.hypot(dx, dy), 1), f = (d - rest) * k;
      force[i].x += (dx / d) * f; force[i].y += (dy / d) * f;
      force[j].x -= (dx / d) * f; force[j].y -= (dy / d) * f;
    }
    points.forEach((p, i) => {
      // Gentle pull to the center, stronger vertically so the map fits a wide frame.
      force[i].x -= p.x * 0.012;
      force[i].y -= p.y * 0.019;
      const length = Math.hypot(force[i].x, force[i].y) || 1;
      const move = Math.min(length, 30) * cooling;
      p.x += (force[i].x / length) * move;
      p.y += (force[i].y / length) * move;
    });
  }
  return points;
}

function fitToView(points) {
  const xs = points.map((p) => p.x), ys = points.map((p) => p.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const scale = Math.min(
    (VIEW.width - 2 * VIEW.padding) / Math.max(maxX - minX, 1),
    (VIEW.height - 2 * VIEW.padding) / Math.max(maxY - minY, 1),
    2.2,
  );
  const midX = (minX + maxX) / 2, midY = (minY + maxY) / 2;
  return new Map(points.map((p) => [p.id, {
    x: VIEW.width / 2 + (p.x - midX) * scale,
    y: VIEW.height / 2 + (p.y - midY) * scale,
  }]));
}
