// Transit vehicles running along their routes on the network map.
//
// Database values decide what you see:
//   vehicle shape          <- TransitType (rail is long, vans are short)
//   vehicles in service    <- DailyCapacity (1 to 3)
//   where vehicles pause   <- HasTransitStop (stops) vs pass-through
//   how long they're held  <- AvgWaitSec at each intersection
// Vehicles run end to end and back. Their position is a pure function of
// time, so redrawing the map never resets them.

import { svgEl } from "../dom.js";

const SPEED = 105; // px per second while moving

const smooth = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
const degrees = (radians) => (radians * 180) / Math.PI;

function vehicleSize(transitType) {
  const type = (transitType || "").toLowerCase();
  if (/rail|tram|streetcar|subway|metro|train/.test(type)) return { length: 36, width: 12 };
  if (/van|shuttle/.test(type)) return { length: 17, width: 10 };
  return { length: 26, width: 11.5 }; // bus and anything else
}

const vehiclesInService = (capacity) => Math.min(3, Math.max(1, 1 + Math.floor((capacity || 0) / 1500)));

/** Seconds a vehicle spends at a path point: longer at stops and at congested intersections. */
export function dwellTime(isStop, avgWaitSec) {
  const wait = avgWaitSec || 0;
  return isStop ? 1.1 + wait / 90 : 0.1 + wait / 160;
}

/**
 * One round trip as phases: drive a segment, then wait at the next point.
 * segments[i] runs from path point i to i+1; dwell[j] is seconds at point j.
 */
function roundTrip(segments, dwell) {
  const drive = (from, to) => {
    const angle = degrees(Math.atan2(to.y - from.y, to.x - from.x));
    return {
      duration: Math.max(0.3, Math.hypot(to.x - from.x, to.y - from.y) / SPEED),
      at: (f) => {
        const e = smooth(f); // slow down into each intersection, speed up out of it
        return { x: from.x + (to.x - from.x) * e, y: from.y + (to.y - from.y) * e, angle };
      },
    };
  };
  const wait = (point, angle, duration) => ({ duration, at: () => ({ ...point, angle }) });
  const heading = (s) => degrees(Math.atan2(s.b.y - s.a.y, s.b.x - s.a.x));

  const phases = [];
  segments.forEach((s, i) => phases.push(drive(s.a, s.b), wait(s.b, heading(s), dwell[i + 1])));
  for (let i = segments.length - 1; i >= 0; i--) {
    const s = segments[i];
    phases.push(drive(s.b, s.a), wait(s.a, heading(s) + 180, dwell[i]));
  }
  return phases;
}

/**
 * Create the vehicles for one route in `layer` and return update(t).
 * route: { Type, Capacity, color }; segments: [{a, b}] in travel order.
 */
export function transitVehicles(route, segments, dwell, layer, { dimmed = false } = {}) {
  if (!segments.length) return null;
  const phases = roundTrip(segments, dwell);
  const period = phases.reduce((sum, p) => sum + p.duration, 0);
  const { length, width } = vehicleSize(route.Type);
  const count = vehiclesInService(route.Capacity);

  const vehicles = Array.from({ length: count }, () => layer.appendChild(
    svgEl("g", { class: `vehicle${dimmed ? " dim" : ""}` },
      svgEl("rect", { class: "body", x: -length / 2, y: -width / 2, width: length, height: width, rx: 4, style: { fill: route.color } }),
      svgEl("rect", { class: "window", x: -length / 2 + 4.5, y: -width / 2 + 3, width: length - 9, height: width - 6, rx: 1 }))));

  return (t) => {
    vehicles.forEach((node, i) => {
      let remaining = (((t + (i * period) / count) % period) + period) % period;
      for (const phase of phases) {
        if (remaining <= phase.duration) {
          const { x, y, angle } = phase.at(remaining / phase.duration);
          node.setAttribute("transform", `translate(${x.toFixed(1)},${y.toFixed(1)}) rotate(${angle.toFixed(1)})`);
          return;
        }
        remaining -= phase.duration;
      }
    });
  };
}
