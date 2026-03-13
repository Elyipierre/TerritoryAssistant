import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { computeCentroid } from './territoryMap';
import { getPdfCalibration } from './localOps';

const S12_TEMPLATE_PATH = '/templates/S-12alternate-E.pdf';
const S13_TEMPLATE_PATH = '/templates/S-13_E.pdf';

let templateCache = new Map();

async function fetchTemplate(path) {
  if (!templateCache.has(path)) {
    templateCache.set(path, fetch(path).then(async (response) => {
      if (!response.ok) throw new Error(`Unable to load PDF template: ${path}`);
      return new Uint8Array(await response.arrayBuffer());
    }));
  }
  return templateCache.get(path);
}

function safeText(value) {
  return String(value ?? '').trim();
}

function shortName(value) {
  const raw = safeText(value);
  if (!raw) return '—';
  if (raw.includes('@')) return raw.split('@')[0].slice(0, 18);
  return raw.slice(0, 18);
}

function dateText(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const yy = String(date.getFullYear()).slice(-2);
  return `${mm}/${dd}/${yy}`;
}

function wrapText(text, maxChars = 42) {
  const words = safeText(text).split(/\s+/).filter(Boolean);
  if (!words.length) return [''];
  const lines = [];
  let current = words.shift() || '';
  words.forEach((word) => {
    const test = `${current} ${word}`;
    if (test.length > maxChars) {
      lines.push(current);
      current = word;
    } else {
      current = test;
    }
  });
  lines.push(current);
  return lines;
}

function deriveStreetLabels(territory) {
  if (Array.isArray(territory?.streetLabels) && territory.streetLabels.length) return territory.streetLabels;
  const seen = new Set();
  const labels = [];
  (territory?.addresses || []).forEach((address) => {
    const street = safeText(address?.street || address?.streetName || address?.crossStreet || address?.road || '');
    if (street && !seen.has(street.toLowerCase())) {
      seen.add(street.toLowerCase());
      labels.push(street);
    }
  });
  return labels.slice(0, 4);
}

function buildAssignmentCycles(rows = []) {
  const byTerritory = new Map();
  rows.forEach((row) => {
    const key = String(row.territory_id ?? row.territoryNo ?? row.territory_no ?? '—');
    if (!byTerritory.has(key)) byTerritory.set(key, []);
    byTerritory.get(key).push(row);
  });

  const ledger = new Map();
  byTerritory.forEach((territoryRows, key) => {
    const sorted = [...territoryRows].sort((a, b) => new Date(a.action_date || 0) - new Date(b.action_date || 0));
    const cycles = [];
    let active = null;

    sorted.forEach((row) => {
      const action = safeText(row.action).toLowerCase();
      if (action === 'selected') {
        if (active) cycles.push(active);
        active = {
          assignedTo: shortName(row.publisher_id || row.publisher_name || row.email),
          assignedDate: row.action_date,
          completedDate: null,
          completionLabel: ''
        };
      } else if (action === 'completed' || action === 'returned') {
        if (!active) {
          active = {
            assignedTo: shortName(row.publisher_id || row.publisher_name || row.email),
            assignedDate: row.action_date,
            completedDate: null,
            completionLabel: ''
          };
        }
        active.completedDate = row.action_date;
        active.completionLabel = action === 'returned' ? 'Returned' : 'Completed';
        cycles.push(active);
        active = null;
      }
    });

    if (active) cycles.push(active);
    const visibleCycles = cycles.slice(-4);
    const lastCompleted = cycles.filter((cycle) => cycle.completedDate).at(-5)?.completedDate || cycles.filter((cycle) => cycle.completedDate).at(-1)?.completedDate || '';

    ledger.set(key, {
      territoryId: key,
      lastCompleted,
      visibleCycles
    });
  });

  return ledger;
}

function resolveTerritoryId(territory) {
  return String(territory?.territoryNo ?? territory?.id ?? territory?.territory_id ?? '—');
}

function fitPolygonToBox(points, boxX, boxY, boxW, boxH, padding = 18) {
  if (!points?.length) return [];
  const minX = Math.min(...points.map((point) => point[0]));
  const maxX = Math.max(...points.map((point) => point[0]));
  const minY = Math.min(...points.map((point) => point[1]));
  const maxY = Math.max(...points.map((point) => point[1]));
  const sourceW = Math.max(1, maxX - minX);
  const sourceH = Math.max(1, maxY - minY);
  const usableW = boxW - padding * 2;
  const usableH = boxH - padding * 2;
  const scale = Math.min(usableW / sourceW, usableH / sourceH);
  const drawW = sourceW * scale;
  const drawH = sourceH * scale;
  const offsetX = boxX + (boxW - drawW) / 2;
  const offsetY = boxY + (boxH - drawH) / 2;

  return points.map(([x, y]) => [
    offsetX + (x - minX) * scale,
    offsetY + (y - minY) * scale
  ]);
}

function getTerritoryDncRows(territory, dncRows = []) {
  const territoryIds = new Set([
    String(territory?.id ?? ''),
    String(territory?.territoryNo ?? ''),
    String(territory?.territory_id ?? '')
  ].filter(Boolean));

  return dncRows.filter((row) => territoryIds.has(String(row.territory_id ?? row.territoryNo ?? row.territory_no ?? '')) && row.is_verified);
}

function drawMultiline(page, font, lines, x, startY, options = {}) {
  const { size = 10, color = rgb(0, 0, 0), lineHeight = size + 2, maxLines = lines.length } = options;
  lines.slice(0, maxLines).forEach((line, index) => {
    page.drawText(line, { x, y: startY - index * lineHeight, size, font, color });
  });
}



function drawTerritoryOutline(page, points, options = {}) {
  if (!points?.length) return;
  const {
    color = rgb(0.13, 0.5, 0.56),
    thickness = 1.1,
    opacity = 0.9
  } = options;
  for (let i = 0; i < points.length; i += 1) {
    const current = points[i];
    const next = points[(i + 1) % points.length];
    page.drawLine({
      start: { x: current[0], y: current[1] },
      end: { x: next[0], y: next[1] },
      thickness,
      color,
      opacity
    });
  }
}

function labelForTerritory(territory) {
  return safeText(territory.locality || territory.city || territory.state || 'Unknown locality');
}

function drawStreetLabels(page, font, labels, box) {
  if (!labels?.length) return;
  const [x, y, w, h] = box;
  const anchors = labels.slice(0, 4).map((_, i, arr) => {
    const angle = (Math.PI * 2 * i) / arr.length - Math.PI / 2;
    return [x + w / 2 + Math.cos(angle) * Math.min(62, w * 0.22), y + h / 2 + Math.sin(angle) * Math.min(42, h * 0.2)];
  });

  labels.slice(0, 4).forEach((label, i) => {
    const [ax, ay] = anchors[i];
    const text = label.toUpperCase();
    const size = 6.5;
    const width = font.widthOfTextAtSize(text, size);
    page.drawRectangle({
      x: ax - width / 2 - 4,
      y: ay - 4,
      width: width + 8,
      height: 11,
      color: rgb(0.08, 0.13, 0.24),
      opacity: 0.18,
      borderColor: rgb(0.75, 0.9, 0.88),
      borderWidth: 0.35,
      borderOpacity: 0.16,
      borderRadius: 8
    });
    page.drawText(text, { x: ax - width / 2, y: ay - 0.5, size, font, color: rgb(0.76, 0.9, 0.86), opacity: 0.55 });
  });
}

export async function buildS13Pdf({ history = [], territories = [], serviceYear = '', selectedTerritoryIds = null, calibration = null }) {
  const templateBytes = await fetchTemplate(S13_TEMPLATE_PATH);
  const pdfCalibration = calibration || getPdfCalibration();
  const offsetX = Number(pdfCalibration.s13OffsetX || 0);
  const offsetY = Number(pdfCalibration.s13OffsetY || 0);
  const rowNudge = Number(pdfCalibration.s13RowNudge || 0);
  const templateDoc = await PDFDocument.load(templateBytes);
  const output = await PDFDocument.create();
  const helvetica = await output.embedFont(StandardFonts.Helvetica);
  const helveticaBold = await output.embedFont(StandardFonts.HelveticaBold);

  const templatePage = templateDoc.getPage(0);
  const ledger = buildAssignmentCycles(history);

  const filtered = territories.filter((territory) => {
    if (!selectedTerritoryIds?.length) return true;
    return selectedTerritoryIds.includes(resolveTerritoryId(territory));
  });

  const rows = filtered.length ? filtered.map((territory) => {
    const territoryId = resolveTerritoryId(territory);
    const record = ledger.get(territoryId) || { lastCompleted: '', visibleCycles: [] };
    return { territoryId, record };
  }) : [...ledger.entries()].map(([territoryId, record]) => ({ territoryId, record }));

  const rowsPerPage = 14;
  const rowHeight = 42.4;
  const startY = 728;
  const territoryX = 37;
  const lastCompletedX = 86;
  const groupStarts = [173, 280.5, 388, 495.5];

  for (let i = 0; i < rows.length; i += rowsPerPage) {
    const [pageRef] = await output.copyPages(templateDoc, [0]);
    output.addPage(pageRef);
    const page = output.getPages().at(-1);

    const serviceYearText = safeText(serviceYear || `${new Date().getFullYear()}`);
    if (serviceYearText) {
      page.drawText(serviceYearText, { x: 109 + offsetX, y: 47 + offsetY, size: 10.5, font: helvetica, color: rgb(0, 0, 0) });
    }

    rows.slice(i, i + rowsPerPage).forEach((row, index) => {
      const y = startY - index * rowHeight + rowNudge;
      page.drawText(row.territoryId, { x: territoryX + offsetX, y: y + offsetY, size: 10, font: helveticaBold, color: rgb(0, 0, 0) });
      page.drawText(dateText(row.record.lastCompleted), { x: lastCompletedX + offsetX, y: y + offsetY, size: 9.2, font: helvetica, color: rgb(0, 0, 0) });

      row.record.visibleCycles.slice(0, 4).forEach((cycle, cycleIndex) => {
        const gx = groupStarts[cycleIndex];
        page.drawText(shortName(cycle.assignedTo), { x: gx + offsetX, y: y + 10 + offsetY, size: 8.7, font: helvetica, color: rgb(0, 0, 0) });
        page.drawText(dateText(cycle.assignedDate), { x: gx + 58 + offsetX, y: y + 10 + offsetY, size: 8.2, font: helvetica, color: rgb(0, 0, 0) });
        page.drawText(dateText(cycle.completedDate), { x: gx + 58 + offsetX, y: y - 10 + offsetY, size: 8.2, font: helvetica, color: rgb(0, 0, 0) });
      });
    });
  }

  return new Blob([await output.save()], { type: 'application/pdf' });
}

export async function buildS12Pdf({ territories = [], dncRows = [], selectedTerritoryIds = null, calibration = null }) {
  const templateBytes = await fetchTemplate(S12_TEMPLATE_PATH);
  const pdfCalibration = calibration || getPdfCalibration();
  const offsetX = Number(pdfCalibration.s12OffsetX || 0);
  const offsetY = Number(pdfCalibration.s12OffsetY || 0);
  const mapOffsetX = Number(pdfCalibration.s12MapOffsetX || 0);
  const mapOffsetY = Number(pdfCalibration.s12MapOffsetY || 0);
  const mapScale = Number(pdfCalibration.s12MapScale || 1);
  const templateDoc = await PDFDocument.load(templateBytes);
  const output = await PDFDocument.create();
  const helvetica = await output.embedFont(StandardFonts.Helvetica);
  const helveticaBold = await output.embedFont(StandardFonts.HelveticaBold);

  const selected = territories.filter((territory) => {
    if (!selectedTerritoryIds?.length) return true;
    return selectedTerritoryIds.includes(resolveTerritoryId(territory));
  });

  for (const territory of selected) {
    const [frontRef] = await output.copyPages(templateDoc, [0]);
    output.addPage(frontRef);
    const frontPage = output.getPages().at(-1);

    const territoryNo = resolveTerritoryId(territory);
    const locality = safeText(territory.locality || territory.city || territory.state || '');
    frontPage.drawText(locality || '—', { x: 62 + offsetX, y: 215 + offsetY, size: 9.5, font: helvetica, color: rgb(0, 0, 0) });
    frontPage.drawText(territoryNo, { x: 335 + offsetX, y: 215 + offsetY, size: 10.5, font: helveticaBold, color: rgb(0, 0, 0) });

    const fitted = fitPolygonToBox(territory.pathPoints || [], 26 + mapOffsetX + offsetX, 70 + mapOffsetY + offsetY, 362 * mapScale, 118 * mapScale, 14);
    if (fitted.length) {
      for (let i = 0; i < fitted.length; i += 1) {
        const current = fitted[i];
        const next = fitted[(i + 1) % fitted.length];
        frontPage.drawLine({
          start: { x: current[0], y: current[1] },
          end: { x: next[0], y: next[1] },
          thickness: 1.1,
          color: rgb(0.13, 0.5, 0.56),
          opacity: 0.9
        });
      }

      const labels = deriveStreetLabels(territory);
      drawStreetLabels(frontPage, helveticaBold, labels, [26 + mapOffsetX + offsetX, 70 + mapOffsetY + offsetY, 362 * mapScale, 118 * mapScale]);
    }

    // Back side / restricted list page
    const backPage = output.addPage([413.9, 267.7]);
    const { width, height } = backPage.getSize();
    backPage.drawRectangle({ x: 12, y: 12, width: width - 24, height: height - 24, borderColor: rgb(0.4, 0.45, 0.5), borderWidth: 0.8, dashArray: [4, 3] });
    backPage.drawLine({ start: { x: width / 2, y: 12 }, end: { x: width / 2, y: height - 12 }, thickness: 0.6, color: rgb(0.55, 0.58, 0.62), dashArray: [3, 3] });
    backPage.drawText('TERRITORY CARD BACK', { x: 136 + offsetX, y: 240 + offsetY, size: 11, font: helveticaBold, color: rgb(0, 0, 0) });
    backPage.drawText(`Locality: ${locality || '—'}`, { x: 24 + offsetX, y: 222 + offsetY, size: 9.2, font: helvetica, color: rgb(0, 0, 0) });
    backPage.drawText(`Terr. No.: ${territoryNo}`, { x: 250 + offsetX, y: 222 + offsetY, size: 9.2, font: helveticaBold, color: rgb(0, 0, 0) });
    backPage.drawText('Verified Do Not Call Addresses', { x: 24 + offsetX, y: 202 + offsetY, size: 10.2, font: helveticaBold, color: rgb(0, 0, 0) });

    const dncList = getTerritoryDncRows(territory, dncRows)
      .map((row) => safeText(row.address))
      .filter(Boolean);

    const lines = dncList.length ? dncList.flatMap((value) => wrapText(value, 42)) : ['No verified restricted addresses on file.'];
    drawMultiline(backPage, helvetica, lines, 24 + offsetX, 184 + offsetY, { size: 8.7, lineHeight: 11, maxLines: 12 });

    backPage.drawText('Print double-sided, cut along dashed border, and fold on center line.', { x: 24 + offsetX, y: 24 + offsetY, size: 7.2, font: helvetica, color: rgb(0.2, 0.2, 0.2) });
  }

  return new Blob([await output.save()], { type: 'application/pdf' });
}


export async function buildTerritoryAtlasPdf({ territories = [], selectedTerritoryIds = null, calibration = null }) {
  const pdfCalibration = calibration || getPdfCalibration();
  const offsetX = Number(pdfCalibration.s12OffsetX || 0);
  const offsetY = Number(pdfCalibration.s12OffsetY || 0);
  const output = await PDFDocument.create();
  const helvetica = await output.embedFont(StandardFonts.Helvetica);
  const helveticaBold = await output.embedFont(StandardFonts.HelveticaBold);

  const selected = territories.filter((territory) => {
    if (!selectedTerritoryIds?.length) return true;
    return selectedTerritoryIds.includes(resolveTerritoryId(territory));
  });

  const page = output.addPage([792, 612]);
  page.drawText('Territory Atlas', { x: 36 + offsetX, y: 578 + offsetY, size: 22, font: helveticaBold, color: rgb(0.05, 0.08, 0.16) });
  page.drawText(`Generated ${new Date().toLocaleDateString()}`, { x: 36 + offsetX, y: 560 + offsetY, size: 10, font: helvetica, color: rgb(0.28, 0.32, 0.4) });
  page.drawText(`${selected.length} territories`, { x: 685 + offsetX, y: 578 + offsetY, size: 11, font: helveticaBold, color: rgb(0.05, 0.08, 0.16) });

  const overviewBox = [28 + offsetX, 250 + offsetY, 736, 284];
  page.drawRectangle({ x: overviewBox[0], y: overviewBox[1], width: overviewBox[2], height: overviewBox[3], borderColor: rgb(0.75, 0.8, 0.86), borderWidth: 1 });

  const allPoints = selected.flatMap((territory) => territory.pathPoints || []);
  const fittedOverview = fitPolygonToBox(allPoints, overviewBox[0], overviewBox[1], overviewBox[2], overviewBox[3], 18);
  let cursor = 0;
  selected.forEach((territory) => {
    const count = territory.pathPoints?.length || 0;
    const fitted = fittedOverview.slice(cursor, cursor + count);
    cursor += count;
    drawTerritoryOutline(page, fitted, { color: rgb(0.13, 0.46, 0.55), thickness: 0.8, opacity: 0.82 });
    const center = computeCentroid(fitted);
    page.drawCircle({ x: center[0], y: center[1], size: 11, color: rgb(0.06, 0.1, 0.18), opacity: 0.86, borderColor: rgb(0.75, 0.92, 0.88), borderWidth: 0.8 });
    const bubbleText = String(resolveTerritoryId(territory));
    const size = 8;
    const width = helveticaBold.widthOfTextAtSize(bubbleText, size);
    page.drawText(bubbleText, { x: center[0] - width / 2, y: center[1] - 2.5, size, font: helveticaBold, color: rgb(0.9, 0.97, 0.95) });
  });

  const cards = selected.slice(0, 8);
  cards.forEach((territory, index) => {
    const col = index % 2;
    const row = Math.floor(index / 2);
    const boxX = 36 + col * 368 + offsetX;
    const boxY = 176 - row * 54 + offsetY;
    page.drawRectangle({ x: boxX, y: boxY, width: 340, height: 44, borderColor: rgb(0.82, 0.85, 0.89), borderWidth: 0.6, borderOpacity: 0.9 });
    page.drawText(`Territory ${resolveTerritoryId(territory)}`, { x: boxX + 10, y: boxY + 29, size: 10.5, font: helveticaBold, color: rgb(0.08, 0.12, 0.18) });
    page.drawText(labelForTerritory(territory), { x: boxX + 10, y: boxY + 16, size: 8.8, font: helvetica, color: rgb(0.24, 0.28, 0.36) });
    const streets = deriveStreetLabels(territory).slice(0, 3);
    page.drawText(streets.length ? streets.join(' • ') : 'Cross streets unavailable', { x: boxX + 126, y: boxY + 16, size: 7.8, font: helvetica, color: rgb(0.2, 0.45, 0.42) });
  });

  for (let start = 0; start < selected.length; start += 4) {
    const detailPage = output.addPage([612, 792]);
    detailPage.drawText('All Territories Detailed Print', { x: 36 + offsetX, y: 760 + offsetY, size: 20, font: helveticaBold, color: rgb(0.05, 0.08, 0.16) });
    detailPage.drawText(`Territories ${start + 1}-${Math.min(start + 4, selected.length)} of ${selected.length}`, { x: 36 + offsetX, y: 742 + offsetY, size: 10, font: helvetica, color: rgb(0.28, 0.32, 0.4) });

    selected.slice(start, start + 4).forEach((territory, localIndex) => {
      const cardRow = Math.floor(localIndex / 2);
      const cardCol = localIndex % 2;
      const cardX = 36 + cardCol * 276 + offsetX;
      const cardY = 392 - cardRow * 330 + offsetY;
      const cardW = 260;
      const cardH = 292;
      detailPage.drawRectangle({ x: cardX, y: cardY, width: cardW, height: cardH, borderColor: rgb(0.72, 0.76, 0.84), borderWidth: 0.8 });
      detailPage.drawText(`Territory ${resolveTerritoryId(territory)}`, { x: cardX + 12, y: cardY + cardH - 22, size: 14, font: helveticaBold, color: rgb(0.06, 0.1, 0.18) });
      detailPage.drawText(labelForTerritory(territory), { x: cardX + 12, y: cardY + cardH - 38, size: 9.6, font: helvetica, color: rgb(0.24, 0.28, 0.36) });

      const mapBox = [cardX + 12, cardY + 90, cardW - 24, 132];
      detailPage.drawRectangle({ x: mapBox[0], y: mapBox[1], width: mapBox[2], height: mapBox[3], borderColor: rgb(0.82, 0.85, 0.89), borderWidth: 0.6 });
      const fitted = fitPolygonToBox(territory.pathPoints || [], mapBox[0], mapBox[1], mapBox[2], mapBox[3], 12);
      drawTerritoryOutline(detailPage, fitted, { color: rgb(0.13, 0.48, 0.57), thickness: 1.15, opacity: 0.92 });
      drawStreetLabels(detailPage, helveticaBold, deriveStreetLabels(territory).slice(0, 4), mapBox);
      const center = computeCentroid(fitted);
      detailPage.drawCircle({ x: center[0], y: center[1], size: 12, color: rgb(0.06, 0.1, 0.18), opacity: 0.88, borderColor: rgb(0.75, 0.92, 0.88), borderWidth: 0.9 });
      const bubbleText = String(resolveTerritoryId(territory));
      const size = 9;
      const width = helveticaBold.widthOfTextAtSize(bubbleText, size);
      detailPage.drawText(bubbleText, { x: center[0] - width / 2, y: center[1] - 2.7, size, font: helveticaBold, color: rgb(0.9, 0.97, 0.95) });

      const streets = deriveStreetLabels(territory);
      drawMultiline(detailPage, helvetica, streets.length ? streets.map((street, idx) => `${idx + 1}. ${street}`) : ['No cross streets derived'], cardX + 12, cardY + 72, { size: 8.4, lineHeight: 10.5, maxLines: 4 });
      detailPage.drawText(`Addresses: ${territory.addresses?.length ?? 0}`, { x: cardX + 12, y: cardY + 44, size: 8.7, font: helveticaBold, color: rgb(0.1, 0.14, 0.22) });
      detailPage.drawText(`Strategy: ${safeText(territory.territory_state || 'Available')}`, { x: cardX + 110, y: cardY + 44, size: 8.7, font: helveticaBold, color: rgb(0.1, 0.14, 0.22) });
      detailPage.drawText(`Enabled: ${territory.is_enabled ? 'Yes' : 'No'}`, { x: cardX + 12, y: cardY + 28, size: 8.2, font: helvetica, color: rgb(0.24, 0.28, 0.36) });
    });
  }

  return new Blob([await output.save()], { type: 'application/pdf' });
}
