function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function distributeStreetAnchors(anchor, count, width, height) {
  const [cx, cy] = anchor;
  const anchors = [];
  const radiusX = Math.min(115, width * 0.16);
  const radiusY = Math.min(85, height * 0.14);

  for (let i = 0; i < count; i += 1) {
    const angle = (Math.PI * 2 * i) / Math.max(count, 1) - Math.PI / 2;
    anchors.push([
      clamp(cx + Math.cos(angle) * radiusX, 90, 1510),
      clamp(cy + Math.sin(angle) * radiusY, 80, 840)
    ]);
  }

  return anchors;
}

function StreetChip({ label, x, y }) {
  const width = label.length * 8 + 20;
  const height = 28;
  return (
    <g>
      <rect className="street-chip" x={x - width / 2} y={y - height / 2} width={width} height={height} rx="999" ry="999" />
      <text className="street-label" x={x} y={y} textAnchor="middle" dominantBaseline="middle">{label}</text>
    </g>
  );
}

function TerritoryNumberBubble({ territoryNo, x, y, active = false, disabled = false }) {
  return (
    <g className={`territory-bubble${active ? ' active' : ''}${disabled ? ' disabled' : ''}`}>
      <circle cx={x} cy={y} r="18" />
      <text x={x} y={y} textAnchor="middle" dominantBaseline="middle">{territoryNo}</text>
    </g>
  );
}

function campaignPathClass(entry, highlightedId, completionMap) {
  if (entry.id === highlightedId) return 'territory-highlight-path';
  const completion = completionMap?.get?.(entry.id);
  if (completion?.isCompleted) return 'territory-campaign-complete-path';
  if (completion?.isSelected) return 'territory-campaign-active-path';
  if (entry.is_enabled) return 'territory-campaign-enabled-path';
  return 'territory-base-path';
}

function boundsFromPoints(points = []) {
  if (!points.length) return null;
  const xs = points.map(([x]) => x);
  const ys = points.map(([, y]) => y);
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
}

function buildZoomTransform(entry, mode) {
  if (!entry || mode !== 'selected') return '';
  const bounds = boundsFromPoints(entry.pathPoints);
  if (!bounds) return '';
  const width = Math.max(bounds.maxX - bounds.minX, 1);
  const height = Math.max(bounds.maxY - bounds.minY, 1);
  const padding = 120;
  const scale = Math.min((1600 - padding * 2) / width, (900 - padding * 2) / height, 2.6);
  const cx = (bounds.minX + bounds.maxX) / 2;
  const cy = (bounds.minY + bounds.maxY) / 2;
  const tx = 800 - cx * scale;
  const ty = 450 - cy * scale;
  return `translate(${tx.toFixed(2)} ${ty.toFixed(2)}) scale(${scale.toFixed(3)})`;
}

export default function TerritoryMapPanel({
  entries = [],
  highlightedId = null,
  title = 'Master Map',
  subtitle = 'Unified territory geometry',
  mode = 'all',
  onModeChange,
  onTerritorySelect,
  completionMap,
  interactive = true,
  selectedOnlyTitle,
  showToolbar = true
}) {
  const highlighted = entries.find((entry) => entry.id === highlightedId) ?? null;
  const streetLabels = highlighted?.streetLabels?.slice(0, 4) ?? [];
  const anchors = highlighted ? distributeStreetAnchors(highlighted.anchor ?? highlighted.centroid, streetLabels.length, highlighted.width ?? 240, highlighted.height ?? 240) : [];
  const renderedEntries = entries;
  const zoomTransform = buildZoomTransform(highlighted, mode);

  return (
    <article className="panel-card wide map-panel">
      <div className="panel-card-header map-panel-header">
        <div>
          <h3>{title}</h3>
          <p>{mode === 'selected' && highlighted ? (selectedOnlyTitle ?? `Focused on Territory ${highlighted.territoryNo ?? highlighted.id}.`) : subtitle}</p>
        </div>
        {showToolbar ? (
          <div className="map-mode-toggle" role="tablist" aria-label="Map view mode">
            <button type="button" className={mode === 'selected' ? 'active' : ''} onClick={() => onModeChange?.('selected')}>Selected Territory</button>
            <button type="button" className={mode === 'all' ? 'active' : ''} onClick={() => onModeChange?.('all')}>All Territories</button>
            <button type="button" className={mode === 'campaign' ? 'active' : ''} onClick={() => onModeChange?.('campaign')}>Campaign Mode</button>
          </div>
        ) : null}
      </div>
      <div className={`map-frame ${interactive ? 'interactive' : ''}${mode === 'selected' && highlighted ? ' territory-zoomed' : ''}`}>
        <svg viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid meet">
          <g className="map-scene" transform={zoomTransform}>
          {mode !== 'campaign' ? (
            <g className="base-layer-startup">
              {renderedEntries.map((entry) => (
                <path
                  key={entry.renderKey}
                  className={`territory-base-path${highlightedId === entry.id ? ' territory-map-highlighted' : ''}${mode === 'selected' && highlightedId !== entry.id ? ' territory-dimmed-path' : ''}`}
                  d={entry.pathData}
                  onClick={interactive ? () => onTerritorySelect?.(entry.id) : undefined}
                />
              ))}
            </g>
          ) : (
            <g className="base-layer-startup">
              {entries.map((entry) => (
                <path
                  key={entry.renderKey}
                  className={campaignPathClass(entry, highlightedId, completionMap)}
                  d={entry.pathData}
                  onClick={interactive ? () => onTerritorySelect?.(entry.id) : undefined}
                />
              ))}
            </g>
          )}

          {mode === 'all' ? (
            <g className="territory-bubbles-layer">
              {entries.map((entry) => (
                <g key={`bubble-${entry.renderKey}`} onClick={interactive ? () => onTerritorySelect?.(entry.id) : undefined}>
                  <TerritoryNumberBubble
                    territoryNo={entry.territoryNo ?? entry.id}
                    x={(entry.anchor ?? entry.centroid)[0]}
                    y={(entry.anchor ?? entry.centroid)[1]}
                    active={entry.id === highlightedId}
                    disabled={!entry.is_enabled}
                  />
                </g>
              ))}
            </g>
          ) : null}

          {highlighted ? (
            <g className="highlight-layer visible">
              <path className="territory-highlight-path" d={highlighted.pathData} onClick={interactive ? () => onTerritorySelect?.(highlighted.id) : undefined} />
              {streetLabels.map((label, index) => (
                <StreetChip key={`${highlighted.id}-${label}`} label={label} x={anchors[index][0]} y={anchors[index][1]} />
              ))}
            </g>
          ) : null}
          </g>
        </svg>
      </div>
    </article>
  );
}
