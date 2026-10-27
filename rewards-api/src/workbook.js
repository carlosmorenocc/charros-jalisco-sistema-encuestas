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
const orderSectionSeatKey = (order, section, seat) => [
  canonical(order),canonical(section),canonicalSeat(seat)
].join('|');
const orderSeatKey = (order, seat) => [canonical(order),canonicalSeat(seat)].join('|');
const numeric = (value) => Number(plain(value).replace(/[$,\s]/g,''));
const eligibleEvents = new Set([...ELIGIBLE_EVENTS].map(canonical));

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

function field(record,...names) {
  for (const name of names) {
    if (record?.[name] !== undefined) return record[name];
  }
  return undefined;
}

function addToIndex(index,key,program) {
  const candidates = index.get(key) || [];
  if (!candidates.some((candidate) => candidate.id === program.id)) candidates.push(program);
  index.set(key,candidates);
}

function uniqueCompatible(candidates,segment) {
  if (!segment) return null;
  const compatible = (candidates || []).filter((program) => canonical(program.segment) === canonical(segment));
  return compatible.length === 1 ? compatible[0] : null;
}

function createProgramMatcher(knownPrograms,knownAliases) {
  const exact = knownPrograms instanceof Map ? new Map(knownPrograms) : new Map();
  const byOrderSectionSeat = new Map();
  const byOrderSeat = new Map();
  const historicalAliases = knownAliases instanceof Map ? new Map(knownAliases) : new Map();
  const programs = knownPrograms instanceof Map ? [...knownPrograms.values()] : (knownPrograms || []);
  const aliases = knownAliases instanceof Map ? [...knownAliases.values()] : (knownAliases || []);

  for (const row of programs) {
    const program = {
      ...row,
      id:field(row,'id','programId','program_id'),
      orderNumber:field(row,'orderNumber','order_number'),
      zone:field(row,'zone'),
      section:field(row,'section'),
      seat:field(row,'seat'),
      segment:field(row,'segment')
    };
    if (!program.id || !program.orderNumber || !program.section || !program.seat) continue;
    exact.set(seatKey(program.orderNumber,program.zone,program.section,program.seat),program);
    addToIndex(byOrderSectionSeat,orderSectionSeatKey(program.orderNumber,program.section,program.seat),program);
    addToIndex(byOrderSeat,orderSeatKey(program.orderNumber,program.seat),program);
  }

  for (const row of aliases) {
    const program = {
      ...row,
      id:field(row,'id','programId','program_id'),
      segment:field(row,'segment')
    };
    const order = field(row,'historicalOrderNumber','historical_order_number');
    const zone = field(row,'historicalZone','historical_zone');
    const section = field(row,'historicalSection','historical_section');
    const seat = field(row,'historicalSeat','historical_seat');
    if (!program.id || !order || !section || !seat) continue;
    historicalAliases.set(seatKey(order,zone,section,seat),program);
  }

  return ({ order,zone,section,seat,segment }) => {
    const exactKey = seatKey(order,zone,section,seat);
    const historical = historicalAliases.get(exactKey);
    if (historical) return { program:historical,matchStrategy:'historical_alias' };

    const exactProgram = exact.get(exactKey);
    if (exactProgram) return { program:exactProgram,matchStrategy:'exact' };

    const zoneAlias = uniqueCompatible(
      byOrderSectionSeat.get(orderSectionSeatKey(order,section,seat)),
      segment
    );
    if (zoneAlias) return { program:zoneAlias,matchStrategy:'order_section_seat_alias' };

    const uniqueSeat = uniqueCompatible(byOrderSeat.get(orderSeatKey(order,seat)),segment);
    if (uniqueSeat) return { program:uniqueSeat,matchStrategy:'order_seat_unique' };
    return null;
  };
}

function isMarkerEmpty(value) {
  return ['', '-', 'N/A', 'NA', 'NO APLICA', 'SIN PATROCINADOR'].includes(canonical(value));
}

function isFooterRow(row) {
  return !plain(row.ZONA)
    && !plain(row.ASIENTO)
    && !plain(row.TIPO)
    && !plain(row.COMPRA)
    && !plain(row['EVENTO LIGADO']);
}

function accessExclusion(row) {
  const type = canonical(row.TIPO);
  const event = row['EVENTO LIGADO'];
  if (!['ABONO','CORTESIA ABONO'].includes(type)) return 'Tipo de acceso fuera del programa';
  if (!eligibleEvents.has(canonical(event))) return 'Evento o producto fuera del programa';
  if (!isMarkerEmpty(row.PATROCINADOR)) return 'Acceso asociado a patrocinador';
  if (/COMPROMISO|PATROCIN|COLABORADOR/.test(canonical(`${row.PARAMETRO} ${row.TIPO}`))) {
    return 'Compromiso, patrocinio o colaborador excluido';
  }
  if (/SUITE/.test(canonical(row.ZONA))) return 'Suite excluida';
  return null;
}

function accessRecord(row,timestamp,match,key,segment) {
  return {
    key,
    programId:match.program.id,
    scannedAt:timestamp.scannedAt,
    scanDate:timestamp.scanDate,
    barcode:row['CODIGO DE BARRAS'],
    segment:match.program.segment || segment,
    matchStrategy:match.matchStrategy
  };
}

function earlierRecord(left,right) {
  return Date.parse(left.scannedAt) <= Date.parse(right.scannedAt) ? left : right;
}

export async function inspectWorkbook(buffer, { kind, knownPrograms = new Map(), knownAliases = new Map() } = {}) {
  if (!['sales','access'].includes(kind)) throw new Error('Tipo de archivo no soportado');
  if (buffer.length > 20 * 1024 * 1024) throw new Error('El archivo excede 20 MB');
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  if (workbook.worksheets.length !== 1) throw new Error('El reporte debe contener una sola hoja');
  const rows = table(workbook.worksheets[0]);
  const included = [], excluded = [], review = [], duplicates = [];
  const seen = new Set();
  const observedDates = new Set();
  const matchedByProgram = new Map();
  const matchProgram = createProgramMatcher(knownPrograms,knownAliases);
  let ignoredRows = 0;

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
      continue;
    }

    if (isFooterRow(row)) { ignoredRows += 1; continue; }
    const timestamp = parseAccessTimestamp(row.INGRESO);
    if (timestamp) observedDates.add(timestamp.scanDate);
    const key = seatKey(row.COMPRA, row.ZONA, row.SECCION, row.ASIENTO);
    const exclusion = accessExclusion(row);
    if (exclusion) { excluded.push({ key, reason:exclusion }); continue; }
    if (!timestamp) { review.push({ key, reason: 'Fecha de ingreso inválida' }); continue; }

    const segment = classifySegment(row.ZONA,row['EVENTO LIGADO']);
    const match = matchProgram({
      order:row.COMPRA,
      zone:row.ZONA,
      section:row.SECCION,
      seat:row.ASIENTO,
      segment
    });
    if (!match) {
      review.push({ key, segment, reason: 'Butaca no localizada de forma única en el padrón' });
      continue;
    }

    const record = accessRecord(row,timestamp,match,key,segment);
    const current = matchedByProgram.get(record.programId);
    if (!current) {
      matchedByProgram.set(record.programId,record);
      continue;
    }
    const kept = earlierRecord(current,record);
    const discarded = kept === current ? record : current;
    matchedByProgram.set(record.programId,kept);
    duplicates.push({
      key:discarded.key,
      programId:record.programId,
      reason:'Doble escaneo del mismo abono en el partido',
      keptScannedAt:kept.scannedAt,
      duplicateScannedAt:discarded.scannedAt
    });
  }

  if (kind === 'access') included.push(...matchedByProgram.values());
  const matchStrategies = included.reduce((totals,row) => {
    if (row.matchStrategy) totals[row.matchStrategy] = (totals[row.matchStrategy] || 0) + 1;
    return totals;
  },{ exact:0,historical_alias:0,order_section_seat_alias:0,order_seat_unique:0 });
  return {
    kind,
    sha256:crypto.createHash('sha256').update(buffer).digest('hex'),
    sourceRows:rows.length,
    totalRows:rows.length - ignoredRows,
    ignoredRows,
    included,
    excluded,
    review,
    duplicates,
    matchStrategies,
    observedDates:[...observedDates].sort()
  };
}

export { seatKey, parseAccessTimestamp };
