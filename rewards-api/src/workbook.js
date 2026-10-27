import crypto from 'node:crypto';
import ExcelJS from 'exceljs';
import { classifySegment } from './segments.js';

export const ELIGIBLE_EVENTS = new Set([
  'Charros de Jalisco: Abono Charros LMP 2026-2027',
  'Charros de Jalisco: Abono General Charros LMP 2026-2027',
  'Charros de Jalisco: Abono VIP Charros LMP 2026-2027',
  'Charros de Jalisco: Abono Preferente Charros LMP 2026-2027'
]);
const plain = (value) => String(value?.text ?? value?.result ?? value ?? '').trim();
const canonical = (value) => plain(value)
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toUpperCase()
  .replace(/\s+/g, ' ')
  .trim();
const canonicalSeat = (value) => canonical(value).replace(/[^A-Z0-9]/g,'');
const seatKey = (order, zone, section, seat) => [
  canonical(order),canonical(zone),canonical(section),canonicalSeat(seat)
].join('|');
const numeric = (value) => Number(plain(value).replace(/[$,\s]/g,''));

function parseAccessTimestamp(value) {
  const match = plain(value).match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!match) return null;
  const [,dayText,monthText,yearText,hourText,minuteText,secondText='00'] = match;
  const year = Number(yearText.length === 2 ? `20${yearText}` : yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText);
  const candidate = new Date(Date.UTC(year,month-1,day,hour,minute,second));
  if (
    candidate.getUTCFullYear() !== year
    || candidate.getUTCMonth() !== month - 1
    || candidate.getUTCDate() !== day
    || hour > 23
    || minute > 59
    || second > 59
  ) return null;
  const pad = (number) => String(number).padStart(2,'0');
  const scanDate = `${year}-${pad(month)}-${pad(day)}`;
  return {
    scanDate,
    scannedAt: `${scanDate}T${pad(hour)}:${pad(minute)}:${pad(second)}-06:00`
  };
}

function table(sheet) {
  let headerRow = 0;
  for (let row = 1; row <= Math.min(sheet.rowCount, 30); row += 1) {
    const values = sheet.getRow(row).values.slice(1).map(canonical);
    if (values.includes('ZONA') && values.includes('SECCION') && values.includes('ASIENTO')) { headerRow = row; break; }
  }
  if (!headerRow) throw new Error('No se encontró un encabezado compatible');
  const headers = sheet.getRow(headerRow).values.slice(1).map(canonical);
  return Array.from({ length: sheet.rowCount - headerRow }, (_, index) => {
    const values = sheet.getRow(headerRow + index + 1).values.slice(1);
    return Object.fromEntries(headers.map((header, column) => [header, plain(values[column])]));
  }).filter((row) => Object.values(row).some(Boolean));
}

export async function inspectWorkbook(buffer, { kind, knownPrograms = new Map() } = {}) {
  if (!['sales','access'].includes(kind)) throw new Error('Tipo de archivo no soportado');
  if (buffer.length > 20 * 1024 * 1024) throw new Error('El archivo excede 20 MB');
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  if (workbook.worksheets.length !== 1) throw new Error('El reporte debe contener una sola hoja');
  const rows = table(workbook.worksheets[0]);
  const included = [], excluded = [], review = [], duplicates = [];
  const seen = new Set();
  const observedDates = new Set();
  for (const row of rows) {
    if (kind === 'sales') {
      const event = row.EVENTO;
      const key = seatKey(row['NUMERO DE ORDEN'], row.ZONA, row.SECCION, row.ASIENTO);
      const price = numeric(row.PRECIO);
      const excludedModality = price === 0 || price === 1 || /COLABORADOR/i.test(`${row.TIPO} ${row.PARAMETRO} ${event}`);
      if (!ELIGIBLE_EVENTS.has(event) || /COMPROMISO|PATROCIN/i.test(`${row.PARAMETRO}`) || /SUITE/i.test(row.ZONA) || excludedModality) {
        excluded.push({ key, reason: 'Producto o localidad excluida' }); continue;
      }
      if (seen.has(key)) { duplicates.push({ key, reason: 'Butaca repetida en el archivo' }); continue; }
      seen.add(key);
      const segment = classifySegment(row.ZONA,event);
      const special = !segment;
      const record = { key, orderNumber: row['NUMERO DE ORDEN'], purchaseCode: row['CODIGO DE COMPRA'], holderName: row['*NOMBRE'] || row.PARAMETRO || row.CLIENTE, holderEmail: row['*CORREO ELECTRONICO'] || null, holderPhone: row['*TELEFONO'] || null, zone: row.ZONA, section: row.SECCION, seat: row.ASIENTO, barcode: row['CODIGO DE BARRAS'], sourceEvent: event, segment, specialReview: special };
      (special ? review : included).push(record);
    } else {
      const type = row.TIPO;
      const event = row['EVENTO LIGADO'];
      const key = seatKey(row.COMPRA, row.ZONA, row.SECCION, row.ASIENTO);
      if (canonical(type) !== 'ABONO' || !ELIGIBLE_EVENTS.has(event) || /COMPROMISO|PATROCIN|COLABORADOR/i.test(`${row.PARAMETRO}`) || /SUITE/i.test(row.ZONA)) {
        excluded.push({ key, reason: 'Acceso fuera de reglas' }); continue;
      }
      if (seen.has(key)) { duplicates.push({ key, reason: 'Doble escaneo en el mismo corte' }); continue; }
      seen.add(key);
      const timestamp = parseAccessTimestamp(row.INGRESO);
      if (!timestamp) { review.push({ key, reason: 'Fecha de ingreso inválida' }); continue; }
      observedDates.add(timestamp.scanDate);
      const program = knownPrograms.get(key);
      if (!program) { review.push({ key, reason: 'Butaca no localizada en el padrón' }); continue; }
      included.push({ key, programId: program.id, scannedAt: timestamp.scannedAt, scanDate: timestamp.scanDate, barcode: row['CODIGO DE BARRAS'] });
    }
  }
  return { kind, sha256: crypto.createHash('sha256').update(buffer).digest('hex'), totalRows: rows.length, included, excluded, review, duplicates, observedDates:[...observedDates].sort() };
}

export { seatKey, parseAccessTimestamp };
