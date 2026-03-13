import { useMemo } from 'react';

const ROAD_PATHS = [
  'M-40 715C165 570 270 540 416 505C587 464 720 530 938 445C1108 377 1260 296 1660 220',
  'M-40 286C154 309 275 343 421 316C563 290 677 212 815 232C969 254 1116 345 1293 326C1420 313 1532 255 1660 191',
  'M154 942C271 715 337 605 465 504C602 396 742 342 897 319C1016 301 1167 325 1312 292C1432 264 1545 201 1652 96',
  'M232 -42C341 118 430 254 535 306C627 351 778 350 918 422C1018 475 1142 589 1234 670C1304 731 1391 820 1478 942',
  'M557 -42C594 124 604 215 678 299C748 378 871 418 968 523C1074 639 1127 788 1191 942',
  'M1082 -42C1001 128 965 234 895 320C794 445 611 540 454 637C325 717 185 805 32 942'
];

function hashString(value) {
  return String(value || '').split('').reduce((total, character) => total + character.charCodeAt(0), 0);
}

function computeGlobalBounds(territories = []) {
  const points = territories.flatMap((territory) => territory.polygon || []);
  if (!points.length) {
    return { minLat: 0, maxLat: 1, minLng: 0, maxLng: 1 };
  }

  return {
    minLat: Math.min(...points.map(([lat]) => lat)),
    maxLat: Math.max(...points.map(([lat]) => lat)),
    minLng: Math.min(...points.map(([, lng]) => lng)),
    maxLng: Math.max(...points.map(([, lng]) => lng))
  };
}

function projectPoint(lat, lng, bounds) {
  const width = 1600;
  const height = 900;
  const paddingX = 90;
  const paddingY = 70;
  const drawableW = width - paddingX * 2;
  const drawableH = height - paddingY * 2;

  return [
    paddingX + ((lng - bounds.minLng) / ((bounds.maxLng - bounds.minLng) || 1)) * drawableW,
    height - (paddingY + ((lat - bounds.minLat) / ((bounds.maxLat - bounds.minLat) || 1)) * drawableH)
  ];
}

function fallbackMarkers(selected) {
  const anchor = selected?.anchor ?? selected?.centroid ?? [800, 450];
  const radiusX = Math.min(240, Math.max(100, (selected?.width || 320) * 0.28));
  const radiusY = Math.min(180, Math.max(86, (selected?.height || 240) * 0.26));
  return Array.from({ length: 8 }, (_, index) => {
    const angle = ((Math.PI * 2) / 8) * index;
    return [
      anchor[0] + Math.cos(angle) * radiusX * (index % 2 === 0 ? 0.65 : 0.42),
      anchor[1] + Math.sin(angle) * radiusY * (index % 2 === 0 ? 0.64 : 0.48)
    ];
  });
}

function createAddressMarkers(selectedTerritory, projectedSelected, territories) {
  if (!selectedTerritory || !projectedSelected) return [];

  const withCoordinates = (selectedTerritory.addresses || [])
    .filter((address) => address.lat != null && address.lng != null)
    .slice(0, 18);

  if (!withCoordinates.length) {
    return fallbackMarkers(projectedSelected).map((point, index) => ({
      key: `fallback-${index}`,
      x: point[0],
      y: point[1],
      hot: index % 5 === 0
    }));
  }

  const bounds = computeGlobalBounds(territories);
  return withCoordinates.map((address, index) => {
    const [x, y] = projectPoint(address.lat, address.lng, bounds);
    return {
      key: address.full || `${index}`,
      x,
      y,
      hot: hashString(address.full || index) % 5 === 0
    };
  });
}

function buildTransform(selected, zoomLevel) {
  if (!selected || zoomLevel <= 1) return '';
  const anchor = selected.anchor ?? selected.centroid ?? [800, 450];
  const tx = 800 - anchor[0] * zoomLevel;
  const ty = 450 - anchor[1] * zoomLevel;
  return `translate(${tx.toFixed(2)} ${ty.toFixed(2)}) scale(${zoomLevel.toFixed(2)})`;
}

export default function PremiumMapCanvas({
  territories = [],
  projected = [],
  selectedId = null,
  onSelect,
  focusOnly = false,
  dimOthers = true,
  zoomLevel = 1,
  drawMode = false
}) {
  const selectedProjected = projected.find((territory) => String(territory.id) === String(selectedId)) ?? projected[0] ?? null;
  const selectedTerritory = territories.find((territory) => String(territory.id) === String(selectedId)) ?? territories[0] ?? null;
  const addressMarkers = useMemo(
    () => createAddressMarkers(selectedTerritory, selectedProjected, territories),
    [selectedProjected, selectedTerritory, territories]
  );
  const streetLabels = selectedProjected?.streetLabels?.slice(0, 3) ?? [];
  const transform = buildTransform(selectedProjected, zoomLevel);
  const renderedTerritories = focusOnly && selectedProjected
    ? projected.filter((territory) => territory.id === selectedProjected.id)
    : projected;

  return (
    <div className={`premium-map-canvas${drawMode ? ' draw-mode' : ''}`}>
      <svg viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid meet" aria-label="Territory map">
        <defs>
          <radialGradient id="atlas-vignette" cx="50%" cy="48%" r="70%">
            <stop offset="0%" stopColor="rgba(255,255,255,0)" />
            <stop offset="74%" stopColor="rgba(8,20,48,0.06)" />
            <stop offset="100%" stopColor="rgba(8,20,48,0.22)" />
          </radialGradient>
          <filter id="atlas-glow" x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="18" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id="atlas-badge-shadow" x="-50%" y="-50%" width="200%" height="220%">
            <feDropShadow dx="0" dy="22" stdDeviation="22" floodColor="#081430" floodOpacity="0.28" />
            <feDropShadow dx="0" dy="8" stdDeviation="8" floodColor="#081430" floodOpacity="0.18" />
          </filter>
        </defs>

        <rect x="0" y="0" width="1600" height="900" className="map-base-land" />
        <g className="map-base-roads">
          {ROAD_PATHS.map((path, index) => (
            <path key={path} d={path} className={`map-road ${index % 2 === 0 ? 'major' : 'minor'}`} />
          ))}
        </g>
        <g className="map-neighborhood-patches">
          <circle cx="248" cy="182" r="62" />
          <circle cx="484" cy="718" r="85" />
          <circle cx="1160" cy="198" r="74" />
          <circle cx="1332" cy="674" r="92" />
          <circle cx="742" cy="348" r="58" />
        </g>

        <g transform={transform}>
          {renderedTerritories.map((territory) => {
            const isSelected = territory.id === selectedProjected?.id;
            return (
              <path
                key={territory.renderKey}
                d={territory.pathData}
                className={`map-territory-shape${isSelected ? ' selected' : ''}${dimOthers && selectedProjected && !isSelected ? ' dimmed' : ''}`}
                onClick={onSelect ? () => onSelect(territory.id) : undefined}
              />
            );
          })}

          {selectedProjected ? (
            <>
              <path d={selectedProjected.pathData} className="map-territory-glow" filter="url(#atlas-glow)" />
              {addressMarkers.map((marker) => (
                <circle
                  key={marker.key}
                  className={`map-address-marker${marker.hot ? ' hot' : ''}`}
                  cx={marker.x}
                  cy={marker.y}
                  r={marker.hot ? 7.2 : 5.4}
                />
              ))}
            </>
          ) : null}
        </g>

        {selectedProjected ? (
          <>
            {streetLabels.map((label, index) => {
              const baseX = (selectedProjected.anchor ?? selectedProjected.centroid)[0];
              const baseY = (selectedProjected.anchor ?? selectedProjected.centroid)[1];
              const offsets = [
                [-240, -168],
                [190, -148],
                [-190, 190]
              ];
              const [dx, dy] = offsets[index] ?? [0, 0];
              return (
                <text key={label} className="map-street-label" x={baseX + dx} y={baseY + dy}>
                  {label}
                </text>
              );
            })}
            <g className="map-center-badge" transform={`translate(${(selectedProjected.anchor ?? selectedProjected.centroid)[0]}, ${(selectedProjected.anchor ?? selectedProjected.centroid)[1]})`} filter="url(#atlas-badge-shadow)">
              <path d="M-68 -40h136a18 18 0 0 1 18 18v44a18 18 0 0 1-18 18H14L0 53-14 40h-54a18 18 0 0 1-18-18v-44a18 18 0 0 1 18-18Z" />
              <text x="0" y="7" textAnchor="middle">
                T-{String(selectedTerritory?.territoryNo ?? selectedProjected.territoryNo ?? '').padStart(2, '0')}
              </text>
            </g>
          </>
        ) : null}

        <rect x="0" y="0" width="1600" height="900" fill="url(#atlas-vignette)" />
      </svg>
    </div>
  );
}
