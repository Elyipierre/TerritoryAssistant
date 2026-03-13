import { useEffect, useMemo, useState } from 'react';
import { projectTerritories, VIEW_H, VIEW_W } from '../utils/territoryMap';
import { loadMasterTerritories } from '../utils/masterTerritories';

export default function TerritoryBackdrop() {
  const [highlightIndex, setHighlightIndex] = useState(0);
  const [territories, setTerritories] = useState([]);

  useEffect(() => {
    let alive = true;
    loadMasterTerritories().then((rows) => {
      if (alive) setTerritories(rows);
    }).catch(() => {
      if (alive) setTerritories([]);
    });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (!territories.length) return undefined;
    const timer = window.setInterval(() => {
      setHighlightIndex((prev) => (prev + 1) % territories.length);
    }, 5200);
    return () => window.clearInterval(timer);
  }, [territories.length]);

  const entries = useMemo(() => projectTerritories(territories), [territories]);

  return (
    <div className="scene">
      <svg className="territory-overlay" viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} preserveAspectRatio="xMidYMid meet">
        <g className="base-layer-startup">
          {entries.map((entry) => (
            <path key={entry.renderKey} className="territory-base-path" d={entry.pathData} />
          ))}
        </g>
        {entries[highlightIndex] ? (
          <g className="highlight-layer visible">
            <path className="territory-highlight-path" d={entries[highlightIndex].pathData} />
          </g>
        ) : null}
      </svg>
    </div>
  );
}
