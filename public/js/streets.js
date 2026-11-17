// The street two intersections are both on, or null. Mirrors sharedStreet()
// in src/features/intersections/service.js, which has the final say; this copy
// only lets the page explain a problem before sending anything.

export function sharedStreet(a, b) {
  const streetsOfB = [b.MainStreet, b.CrossStreet].map((s) => s.toLowerCase());
  return [a.MainStreet, a.CrossStreet].find((s) => streetsOfB.includes(s.toLowerCase())) ?? null;
}
