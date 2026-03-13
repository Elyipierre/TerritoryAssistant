import { deriveStreetLabelsFromAddresses } from './addressing';

export const VIEW_W = 1600;
export const VIEW_H = 900;
export const MAP_PAD_X = 90;
export const MAP_PAD_Y = 70;
export const POLYGON_INSET = 0.988;

export function computeCentroid(points) {
  const count = points.length || 1;
  const sum = points.reduce((acc, [x, y]) => ({ x: acc.x + x, y: acc.y + y }), { x: 0, y: 0 });
  return [sum.x / count, sum.y / count];
}

export function insetPolygon(points, scaleFactor = POLYGON_INSET) {
  const [cx, cy] = computeCentroid(points);
  return points.map(([x, y]) => [cx + (x - cx) * scaleFactor, cy + (y - cy) * scaleFactor]);
}

export function pointsToPath(points) {
  return points.map((point, i) => `${i === 0 ? 'M' : 'L'} ${point[0].toFixed(2)} ${point[1].toFixed(2)}`).join(' ') + ' Z';
}

export function projectTerritories(territories) {
  const clean = territories.filter((territory) => Array.isArray(territory?.polygon) && territory.polygon.length >= 3);
  if (!clean.length) return [];

  const allPoints = clean.flatMap((territory) => territory.polygon);
  const lats = allPoints.map(([lat]) => lat);
  const lngs = allPoints.map(([, lng]) => lng);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const drawableW = VIEW_W - MAP_PAD_X * 2;
  const drawableH = VIEW_H - MAP_PAD_Y * 2;

  return clean.map((territory, index) => {
    const projected = territory.polygon.map(([lat, lng]) => {
      const x = MAP_PAD_X + ((lng - minLng) / (maxLng - minLng || 1)) * drawableW;
      const y = VIEW_H - (MAP_PAD_Y + ((lat - minLat) / (maxLat - minLat || 1)) * drawableH);
      return [x, y];
    });

    const insetPoints = insetPolygon(projected);
    const centroid = computeCentroid(insetPoints);
    const width = Math.max(...insetPoints.map((p) => p[0])) - Math.min(...insetPoints.map((p) => p[0]));
    const height = Math.max(...insetPoints.map((p) => p[1])) - Math.min(...insetPoints.map((p) => p[1]));

    let anchor = centroid;
    if (territory?.labelAnchor?.lat && territory?.labelAnchor?.lng) {
      anchor = [
        MAP_PAD_X + ((territory.labelAnchor.lng - minLng) / (maxLng - minLng || 1)) * drawableW,
        VIEW_H - (MAP_PAD_Y + ((territory.labelAnchor.lat - minLat) / (maxLat - minLat || 1)) * drawableH)
      ];
    }

    return {
      ...territory,
      renderKey: String(territory.id ?? territory.territoryNo ?? index + 1),
      centroid,
      anchor,
      width,
      height,
      streetLabels: territory.streetLabels ?? deriveStreetLabelsFromAddresses(territory.addresses, 4),
      pathPoints: insetPoints,
      pathData: pointsToPath(insetPoints)
    };
  });
}

export function summarizeTerritories(territories) {
  const summary = {
    total: territories.length,
    enabled: 0,
    initialCall: 0,
    secondCall: 0,
    letterWriting: 0
  };

  territories.forEach((territory) => {
    if (territory.is_enabled) summary.enabled += 1;
    if (territory.territory_state === 'Initial Call') summary.initialCall += 1;
    if (territory.territory_state === '2nd Call') summary.secondCall += 1;
    if (territory.territory_state === 'Letter Writing') summary.letterWriting += 1;
  });

  return summary;
}

export function pointInPolygon(point, polygon) {
  const [x, y] = point;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i][0], yi = polygon[i][1];
    const xj = polygon[j][0], yj = polygon[j][1];
    const intersect = ((yi > y) !== (yj > y)) &&
      (x < (xj - xi) * (y - yi) / ((yj - yi) || 1e-9) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}
