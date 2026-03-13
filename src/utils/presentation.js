import { formatStatusLabel } from './addressing';

export function territoryLocation(territory) {
  return [territory?.locality, territory?.city, territory?.state, territory?.zip].filter(Boolean).join(', ');
}

export function territoryAvailability(territory, assignmentState) {
  if (!territory?.is_enabled) return 'Disabled';
  if (assignmentState?.isCompleted) return 'Completed';
  if (assignmentState?.isSelected) return 'Assigned';
  return 'Available';
}

export function toneForAvailability(value) {
  if (value === 'Completed') return 'success';
  if (value === 'Assigned') return 'info';
  if (value === 'Disabled') return 'muted';
  return 'teal';
}

export function toneForTerritoryState(value) {
  if (value === 'Letter Writing') return 'warning';
  if (value === '2nd Call') return 'info';
  if (value === 'Initial Call') return 'teal';
  return 'muted';
}

export function toneForStatusCode(code) {
  if (code === 'CM') return 'success';
  if (code === 'DNC') return 'danger';
  if (code === 'OL') return 'warning';
  if (code === 'NA' || code === 'VM') return 'info';
  return 'muted';
}

export function badgeLabelForStatusCode(code) {
  return formatStatusLabel(code || 'UNSET');
}

export function derivePersonName(raw = '') {
  const base = String(raw || '').trim();
  if (!base) return 'Unassigned';
  if (base.includes('@')) {
    return base
      .split('@')[0]
      .split(/[._-]/)
      .filter(Boolean)
      .map((part) => part[0].toUpperCase() + part.slice(1))
      .join(' ');
  }
  return base;
}

export function compactAddressMeta(address = '') {
  const parts = String(address).split(',');
  return parts.slice(1).join(',').trim() || 'No locality available';
}

export function progressFromTerritory({ territory, assignmentState, logCount = 0 }) {
  const addressCount = territory?.addresses?.length ?? 0;
  if (addressCount && logCount) return Math.min(100, Math.round((logCount / addressCount) * 100));
  if (assignmentState?.isCompleted) return 100;
  if (assignmentState?.isSelected) return 52;
  return 0;
}
