// A small live traffic simulation for the network map.
//
// Roads are the road segments between intersections. Where one of an
// intersection's streets has no road segment there, a short "tail" shows that
// street leading off the map; cars arrive and leave along it. Elsewhere cars
// start their trips at intersections. They drive along lanes, queue behind
// each other, obey each intersection's control, turn through it, and continue
// to another road, until they leave by a tail or finish their trip at an
// intersection and fade out.
//
// Database values for the selected time block drive the simulation:
//   cars entering at an intersection  <- AvgVolume (none if it has no readings)
//   signal timing / how slowly it clears <- AvgWaitSec
//   traffic light, stop sign, or free flow <- ControlType
// So busy, slow intersections back up on their own.
//
// The simulation is display-only: nothing here is saved or sent anywhere.

import { svgEl } from "../dom.js";

const JUNCTION_RADIUS = 27;   // lanes start/stop this far from the center
const LANE_OFFSET = 5;      // drive on the right of the center line
export const TAIL_LENGTH = 70; // streets leading off the map
const CAR_GAP = 13;           // bumper-to-bumper spacing in a queue
const SPEED = 80;             // px per second
const TURN_TIME = 0.45;       // seconds to cross an intersection
const MAX_CARS = 170;         // keeps the map readable and fast
const GIVE_UP_AFTER = 12;     // a car stuck this long at the front leaves (prevents gridlock)
const TRIP_END_CHANCE = 0.3;  // chance a car finishes its trip at each intersection it reaches
const WARM_UP_SECONDS = 14;   // simulate this much before showing, so roads start busy
const CAR_COLORS = ["#e5484d", "#4f7fe8", "#f2b134", "#3fa66b", "#8e5bd8", "#ef7d3c", "#2fb5c8", "#d6409f"];

/** Small seeded random generator, so the same data gives the same traffic. */
function seededRandom(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const add = (p, v, k = 1) => ({ x: p.x + v.x * k, y: p.y + v.y * k });
const rightOf = (dir) => ({ x: -dir.y, y: dir.x }); // screen y points down
function direction(a, b) {
  const dx = b.x - a.x, dy = b.y - a.y, length = Math.hypot(dx, dy) || 1;
  return { x: dx / length, y: dy / length, length };
}
const place = (node, x, y, angle) =>
  node.setAttribute("transform", `translate(${x.toFixed(1)},${y.toFixed(1)}) rotate(${angle.toFixed(1)})`);

// ---------------------------------------------------------------------------
// Road layout
// ---------------------------------------------------------------------------

/**
 * @param tails [{ id, angle }]: a street leaving intersection `id` in direction `angle` (radians)
 */
function buildRoads(intersections, edges, positions, tails) {
  const nodes = new Map();
  for (const data of intersections) {
    const p = positions.get(data.ID);
    if (p) nodes.set(data.ID, { data, p, inbound: [], outbound: [], sources: [], lastEntry: -Infinity, rate: 0, credit: 0 });
  }
  const lanes = [];
  const pavement = []; // road center lines to draw

  const addLane = (fromNode, toNode, start, end, kind) => {
    const dir = direction(start, end);
    const lane = {
      fromNode, toNode, start, end, kind, dir,
      length: dir.length, angle: (Math.atan2(dir.y, dir.x) * 180) / Math.PI,
      cars: [], reverse: null, lastExit: -Infinity, incoming: 0,
    };
    lanes.push(lane);
    fromNode?.outbound.push(lane);
    toNode?.inbound.push(lane);
    return lane;
  };

  // Two-way roads between connected intersections.
  for (const edge of edges) {
    const u = nodes.get(edge.a), v = nodes.get(edge.b);
    if (!u || !v) continue;
    const dir = direction(u.p, v.p);
    if (dir.length < 2 * JUNCTION_RADIUS + 4) continue;
    pavement.push({ a: u.p, b: v.p });
    const back = { x: -dir.x, y: -dir.y };
    const forwardLane = addLane(u, v,
      add(add(u.p, dir, JUNCTION_RADIUS), rightOf(dir), LANE_OFFSET),
      add(add(v.p, back, JUNCTION_RADIUS), rightOf(dir), LANE_OFFSET), "road");
    const backLane = addLane(v, u,
      add(add(v.p, back, JUNCTION_RADIUS), rightOf(back), LANE_OFFSET),
      add(add(u.p, dir, JUNCTION_RADIUS), rightOf(back), LANE_OFFSET), "road");
    forwardLane.reverse = backLane;
    backLane.reverse = forwardLane;
  }

  // Tails: cars enter the map on one lane (source) and leave on the other (sink).
  for (const { id, angle } of tails) {
    const node = nodes.get(id);
    if (!node) continue;
    const out = { x: Math.cos(angle), y: Math.sin(angle) };
    const inward = { x: -out.x, y: -out.y };
    const far = add(node.p, out, TAIL_LENGTH);
    pavement.push({ a: node.p, b: far, tail: true });
    const entering = addLane(null, node,
      add(far, rightOf(inward), LANE_OFFSET),
      add(add(node.p, out, JUNCTION_RADIUS), rightOf(inward), LANE_OFFSET), "source");
    const leaving = addLane(node, null,
      add(add(node.p, out, JUNCTION_RADIUS), rightOf(out), LANE_OFFSET),
      add(far, rightOf(out), LANE_OFFSET), "sink");
    entering.reverse = leaving;
    leaving.reverse = entering;
    node.sources.push(entering);
  }
  return { nodes, lanes, pavement };
}

// ---------------------------------------------------------------------------
// Intersection control
// ---------------------------------------------------------------------------

/**
 * How an intersection lets cars in. Returns { isGreen(lane, t), headway, perLane, kind }.
 * headway = minimum seconds between cars entering (per lane for signals,
 * per intersection otherwise).
 */
function controllerFor(node) {
  const { ControlType: type, AvgWaitSec: wait = 0, ID: id } = node.data;
  const offset = ((id * 0.37) % 1) * 10;
  const inbound = node.inbound;

  if (type === "Traffic Light" && inbound.length > 1) {
    // Roads facing each other share a green; the others wait.
    const reference = inbound[0].angle;
    for (const lane of inbound) {
      const diff = (((lane.angle - reference) % 180) + 180) % 180;
      lane.group = diff < 45 || diff > 135 ? 0 : 1;
    }
    if (inbound.every((lane) => lane.group === 0)) inbound.forEach((lane, i) => { lane.group = i % 2; });
    const greenFor = 1.8 + (wait || 0) / 28; // longer waits in the data -> longer reds
    return {
      kind: "light", perLane: true, headway: 0.45 + (wait || 0) / 400,
      isGreen: (lane, t) => Math.floor((t + offset) / greenFor) % 2 === lane.group,
    };
  }
  if (type === "Stop Sign") {
    // Each road takes a turn.
    const turn = 1.0 + (wait || 0) / 70;
    return {
      kind: "stop", perLane: false, headway: turn * 0.8,
      isGreen: (lane, t) => inbound[Math.floor((t + offset) / turn) % inbound.length] === lane,
    };
  }
  // Uncontrolled, roundabout, or unknown: cars merge one at a time.
  return {
    kind: "free", perLane: false,
    headway: type === "Roundabout" ? 0.35 : 0.5 + (wait || 0) / 220,
    isGreen: () => true,
  };
}

// ---------------------------------------------------------------------------
// Simulation
// ---------------------------------------------------------------------------

export class TrafficSim {
  constructor(intersections, edges, positions, tails = []) {
    const { nodes, lanes, pavement } = buildRoads(intersections, edges, positions, tails);
    this.nodes = nodes;
    this.lanes = lanes;
    this.random = seededRandom(intersections.length * 7919 + edges.length * 104729);
    this.turning = [];
    this.carCount = 0;
    this.time = 0;
    this.lastClock = undefined;

    for (const node of nodes.values()) node.controller = controllerFor(node);

    // How often trips start at each intersection, from its average volume.
    for (const node of nodes.values()) {
      const { Readings, AvgVolume } = node.data;
      node.rate = Readings && node.outbound.length ? Math.max(0.08, (AvgVolume || 0) / 900) : 0;
    }

    this.roadLayer = this.drawRoads(pavement);
    this.carLayer = svgEl("g", { class: "traffic" });
    this.signalLayer = this.drawSignals();

    for (let t = 0; t < WARM_UP_SECONDS; t += 0.1) this.step(0.1);
    this.render();
  }

  // ---- static drawing ----

  drawRoads(pavement) {
    const line = (cls, s) => svgEl("line", { class: cls, x1: s.a.x, y1: s.a.y, x2: s.b.x, y2: s.b.y });
    const junction = (cls, r) => [...this.nodes.values()].map((n) => svgEl("circle", { class: cls, cx: n.p.x, cy: n.p.y, r }));
    return svgEl("g", { class: "roads" },
      pavement.map((s) => line("road-edge", s)),
      junction("junction-edge", JUNCTION_RADIUS + 1.5),
      pavement.map((s) => line("road", s)),
      junction("junction", JUNCTION_RADIUS),
      pavement.map((s) => line("road-line", s)),
      [...this.nodes.values()].filter((n) => n.data.ControlType === "Roundabout")
        .map((n) => svgEl("circle", { class: "roundabout", cx: n.p.x, cy: n.p.y, r: 6 })));
  }

  /** Stop bars at the end of each inbound lane for lights and stop signs. */
  drawSignals() {
    const layer = svgEl("g", { class: "signals" });
    for (const node of this.nodes.values()) {
      if (node.controller.kind === "free") continue;
      for (const lane of node.inbound) {
        const right = rightOf(lane.dir);
        const a = add(lane.end, right, -LANE_OFFSET + 0.6);
        const b = add(lane.end, right, LANE_OFFSET + 0.8);
        lane.signal = layer.appendChild(svgEl("line", { class: "signal stop", x1: a.x, y1: a.y, x2: b.x, y2: b.y }));
      }
    }
    return layer;
  }

  // ---- simulation ----

  hasRoomAtStart(lane) {
    const last = lane.cars[lane.cars.length - 1];
    return lane.incoming === 0 && (!last || last.s > CAR_GAP * 1.2);
  }

  /** The road a car takes next, or "end" if its trip finishes at this intersection. */
  pickExit(node, lane) {
    const choices = node.outbound.filter((out) => out !== lane.reverse);
    if (!choices.length || this.random() < TRIP_END_CHANCE) return "end"; // dead ends finish trips too
    return choices[Math.floor(this.random() * choices.length)];
  }

  addCar(lane) {
    const el = this.carLayer.appendChild(svgEl("rect", {
      class: "car", x: -5, y: -3, width: 10, height: 6, rx: 1.8,
      style: { fill: CAR_COLORS[Math.floor(this.random() * CAR_COLORS.length)] },
    }));
    lane.cars.push({ s: 0, wait: 0, next: null, fresh: true, el });
    this.carCount++;
  }

  removeCar(car) {
    car.el.remove();
    this.carCount--;
  }

  step(dt) {
    this.time += dt;
    const now = this.time;

    // New trips: cars arrive along an intersection's tail if it has one,
    // otherwise they start at the intersection onto one of its roads.
    for (const node of this.nodes.values()) {
      if (node.rate === 0) continue;
      node.credit = Math.min(2, node.credit + node.rate * dt);
      if (node.credit < 1 || this.carCount >= MAX_CARS) continue;
      const pool = node.sources.length ? node.sources : node.outbound.filter((lane) => lane.kind === "road");
      if (!pool.length) continue;
      const lane = pool[Math.floor(this.random() * pool.length)];
      if (this.hasRoomAtStart(lane)) {
        this.addCar(lane);
        node.credit -= 1;
      }
    }

    for (const lane of this.lanes) {
      // Drive forward, never closer than CAR_GAP to the car ahead.
      lane.cars.forEach((car, i) => {
        const limit = i === 0 ? lane.length : lane.cars[i - 1].s - CAR_GAP;
        car.s = Math.max(car.s, Math.min(car.s + SPEED * dt, limit));
      });

      const front = lane.cars[0];
      if (!front || front.s < lane.length - 0.5) continue;

      if (lane.kind === "sink") { // left the map along a tail
        this.removeCar(lane.cars.shift());
        continue;
      }

      // Waiting at the stop line: go when allowed and there is room ahead.
      front.wait += dt;
      const node = lane.toNode;
      const control = node.controller;
      front.next ??= this.pickExit(node, lane);
      const lastEntry = control.perLane ? lane.lastExit : node.lastEntry;
      const allowed = control.isGreen(lane, now) && now - lastEntry >= control.headway;

      const ending = front.next === "end";
      if (allowed && (ending || this.hasRoomAtStart(front.next))) {
        lane.cars.shift();
        lane.lastExit = now;
        node.lastEntry = now;
        if (!ending) front.next.incoming++;
        this.turning.push({ car: front, from: lane, to: ending ? null : front.next, center: node.p, progress: 0 });
      } else if (front.wait > GIVE_UP_AFTER) {
        this.removeCar(lane.cars.shift());
      }
    }

    // Cars crossing an intersection join their next road when done.
    this.turning = this.turning.filter((turn) => {
      turn.progress += dt / TURN_TIME;
      if (turn.progress < 1) return true;
      if (!turn.to) { // trip over: the car pulls in and disappears
        this.removeCar(turn.car);
        return false;
      }
      turn.to.incoming--;
      Object.assign(turn.car, { s: 0, wait: 0, next: null, fresh: false });
      turn.to.cars.push(turn.car);
      return false;
    });
  }

  // ---- drawing each frame ----

  render() {
    for (const lane of this.lanes) {
      for (const car of lane.cars) {
        place(car.el, lane.start.x + lane.dir.x * car.s, lane.start.y + lane.dir.y * car.s, lane.angle);
        // Cars fade in as a trip starts and fade out as they leave the map along a tail.
        let opacity = 1;
        if (lane.kind === "sink") opacity = Math.min(1, (lane.length - car.s) / 14);
        else if (car.fresh) opacity = Math.min(1, 0.15 + car.s / 12);
        car.el.setAttribute("opacity", opacity.toFixed(2));
      }
      if (lane.signal) {
        const go = lane.toNode.controller.kind === "light" && lane.toNode.controller.isGreen(lane, this.time);
        lane.signal.setAttribute("class", `signal ${go ? "go" : "stop"}`);
      }
    }
    // Turning cars follow a curve through the middle of the intersection.
    for (const turn of this.turning) {
      // A car ending its trip drives into the middle of the intersection and fades out.
      const a = turn.from.end, c = turn.center, b = turn.to ? turn.to.start : turn.center;
      const p = Math.min(turn.progress, 1), q = 1 - p;
      const x = q * q * a.x + 2 * q * p * c.x + p * p * b.x;
      const y = q * q * a.y + 2 * q * p * c.y + p * p * b.y;
      const dx = 2 * q * (c.x - a.x) + 2 * p * (b.x - c.x);
      const dy = 2 * q * (c.y - a.y) + 2 * p * (b.y - c.y);
      const heading = turn.to || p < 0.9 ? Math.atan2(dy, dx) : (turn.from.angle * Math.PI) / 180;
      place(turn.car.el, x, y, (heading * 180) / Math.PI);
      turn.car.el.setAttribute("opacity", turn.to ? "1" : (1 - p).toFixed(2));
    }
  }

  /** Advance to clock time `t` (seconds) and redraw. */
  update(t) {
    if (this.lastClock !== undefined) {
      let elapsed = Math.min(0.25, Math.max(0, t - this.lastClock)); // a hidden tab doesn't jump ahead
      while (elapsed > 0) {
        const dt = Math.min(elapsed, 1 / 30);
        this.step(dt);
        elapsed -= dt;
      }
    }
    this.lastClock = t;
    this.render();
  }
}
