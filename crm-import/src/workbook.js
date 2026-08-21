import { readFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { DEFAULT_MAX_INPUT_BYTES } from './constants.js';
import { cleanText, isMeaningful, normalizeHeader } from './normalize.js';

const XLSX_MAGIC = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
const SHARED_STRINGS_PATH = 'xl/sharedStrings.xml';
const OOXML_SPREADSHEET_NAMESPACE = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const EMPTY_PREFIXED_SHARED_STRINGS_ERROR_PREFIX = 'Unexpected xml node in parseOpen: ';
const MAX_ZIP_ENTRIES = 10_000;
const MAX_UNCOMPRESSED_ZIP_BYTES = 256 * 1024 * 1024;
const MAX_SHARED_STRINGS_XML_BYTES = 4 * 1024;
const PREFIX_NORMALIZATION_PATH = /^(?:xl\/(?:workbook|styles)\.xml|xl\/worksheets\/sheet\d+\.xml|xl\/tables\/table\d+\.xml)$/u;
const STANDARD_EMPTY_SHARED_STRINGS_XML =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<sst xmlns="${OOXML_SPREADSHEET_NAMESPACE}" count="0" uniqueCount="0"></sst>`;

export async function inspectInputFile(filePath, env = process.env) {
  if (typeof filePath !== 'string' || !filePath.toLocaleLowerCase('en-US').endsWith('.xlsx')) {
    throw new Error('La entrada debe ser un archivo .xlsx; .xls y .xlsm se rechazan.');
  }
  const fileStat = await stat(filePath);
  if (!fileStat.isFile()) throw new Error('La ruta de entrada no es un archivo regular.');

  const configuredLimit = Number(env.CRM_IMPORT_MAX_INPUT_BYTES);
  const maxBytes = Number.isSafeInteger(configuredLimit) && configuredLimit > 0
    ? configuredLimit
    : DEFAULT_MAX_INPUT_BYTES;
  if (fileStat.size <= 0 || fileStat.size > maxBytes) {
    throw new Error(`El archivo excede el límite permitido de ${maxBytes} bytes o está vacío.`);
  }

  const buffer = await readFile(filePath);
  if (!buffer.subarray(0, XLSX_MAGIC.length).equals(XLSX_MAGIC)) {
    throw new Error('El archivo no tiene la firma ZIP esperada para XLSX.');
  }
  return {
    buffer,
    bytes: buffer.length,
    sha256: createHash('sha256').update(buffer).digest('hex')
  };
}

export async function readConfiguredWorkbook(buffer, config) {
  const module = await import('exceljs');
  const ExcelJS = module.default ?? module;
  let workbook;
  let readerDiagnostics = {
    mode: 'standard',
    fallbackReason: null,
    originalBufferModified: false
  };
  try {
    workbook = await loadWorkbook(ExcelJS, buffer);
  } catch (error) {
    if (!isEmptyPrefixedSharedStringsError(error)) throw error;
    const repairedBuffer = await repairEmptyPrefixedSharedStringsInMemory(buffer);
    try {
      workbook = await loadWorkbook(ExcelJS, repairedBuffer);
      readerDiagnostics = {
        mode: 'in_memory_prefixed_ooxml_repair',
        fallbackReason: 'EMPTY_PREFIXED_SHARED_STRINGS_XML',
        originalBufferModified: false
      };
    } finally {
      repairedBuffer.fill(0);
    }
  }

  const configuredSheets = [];
  const workbookSheetIndex = new Map(
    workbook.worksheets.map((worksheet) => [normalizeHeader(worksheet.name), worksheet])
  );

  for (const [configuredName, spec] of Object.entries(config.sheets)) {
    const worksheet = workbookSheetIndex.get(normalizeHeader(configuredName));
    if (!worksheet) {
      configuredSheets.push({
        name: configuredName,
        present: false,
        headerRowNumber: null,
        rows: []
      });
      continue;
    }
    const maximumRows = config.maximumRowsPerSheet ?? 100_000;
    if (Math.max(worksheet.actualRowCount, worksheet.rowCount) > maximumRows) {
      throw new Error(`La hoja ${configuredName} supera el máximo de ${maximumRows} filas.`);
    }
    const maximumColumns = config.maximumColumnsPerSheet ?? 500;
    if (worksheet.columnCount > maximumColumns) {
      throw new Error(`La hoja ${configuredName} supera el máximo de ${maximumColumns} columnas.`);
    }
    configuredSheets.push(readConfiguredSheet(worksheet, configuredName, spec));
  }

  return { sheets: configuredSheets, readerDiagnostics };
}

export function isEmptyPrefixedSharedStringsError(error) {
  const message = String(error?.message ?? '');
  if (!message.startsWith(EMPTY_PREFIXED_SHARED_STRINGS_ERROR_PREFIX)) return false;
  try {
    const node = JSON.parse(message.slice(EMPTY_PREFIXED_SHARED_STRINGS_ERROR_PREFIX.length));
    return node?.name === 'x:sst'
      && node?.isSelfClosing === true
      && node?.attributes
      && Object.keys(node.attributes).length === 1
      && node.attributes['xmlns:x'] === OOXML_SPREADSHEET_NAMESPACE;
  } catch {
    return false;
  }
}

export async function repairEmptyPrefixedSharedStringsInMemory(buffer) {
  const module = await import('jszip');
  const JSZip = module.default ?? module;
  const zip = await JSZip.loadAsync(buffer, {
    checkCRC32: false,
    createFolders: false
  });
  assertZipEnvelopeIsReasonable(zip);

  const sharedStringsEntry = zip.file(SHARED_STRINGS_PATH);
  if (!sharedStringsEntry) throw safeRepairError('SHARED_STRINGS_ENTRY_MISSING');
  const declaredSize = sharedStringsEntry?._data?.uncompressedSize;
  if (Number.isFinite(declaredSize) && declaredSize > MAX_SHARED_STRINGS_XML_BYTES) {
    throw safeRepairError('SHARED_STRINGS_ENTRY_TOO_LARGE_FOR_FALLBACK');
  }
  const sharedStringsXml = await sharedStringsEntry.async('string');
  if (
    Buffer.byteLength(sharedStringsXml, 'utf8') > MAX_SHARED_STRINGS_XML_BYTES
    || !isExactEmptyPrefixedSharedStringsXml(sharedStringsXml)
  ) {
    throw safeRepairError('SHARED_STRINGS_XML_NOT_EXACT_EMPTY_PREFIXED_FORM');
  }

  await assertWorksheetsDoNotReferenceSharedStrings(zip);
  zip.file(SHARED_STRINGS_PATH, STANDARD_EMPTY_SHARED_STRINGS_XML, {
    date: sharedStringsEntry.date,
    compression: 'DEFLATE'
  });
  await normalizeSupportedMainNamespaceEntries(zip);
  const repaired = await zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
    platform: 'DOS'
  });
  const maximumRepairedBytes = Math.max(buffer.length * 4, buffer.length + 1024 * 1024);
  if (repaired.length > maximumRepairedBytes) {
    repaired.fill(0);
    throw safeRepairError('REPAIRED_ARCHIVE_SIZE_OUT_OF_RANGE');
  }
  return repaired;
}

async function loadWorkbook(ExcelJS, buffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer, {
    ignoreNodes: [
      'dataValidations',
      'hyperlinks',
      'drawing',
      'picture',
      'legacyDrawing',
      'tableParts',
      'extLst'
    ]
  });
  return workbook;
}

function isExactEmptyPrefixedSharedStringsXml(xml) {
  const escapedNamespace = OOXML_SPREADSHEET_NAMESPACE.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  const pattern = new RegExp(
    `^\\s*(?:<\\?xml\\s+[^?]*\\?>\\s*)?<x:sst\\s+xmlns:x=(?:"${escapedNamespace}"|'${escapedNamespace}')\\s*\\/>\\s*$`,
    'u'
  );
  return pattern.test(xml);
}

function assertZipEnvelopeIsReasonable(zip) {
  const entries = Object.values(zip.files);
  if (entries.length > MAX_ZIP_ENTRIES) throw safeRepairError('XLSX_ZIP_ENTRY_LIMIT_EXCEEDED');
  let declaredBytes = 0;
  for (const entry of entries) {
    if (entry.dir) continue;
    const size = entry?._data?.uncompressedSize;
    if (Number.isFinite(size) && size >= 0) declaredBytes += size;
    if (declaredBytes > MAX_UNCOMPRESSED_ZIP_BYTES) {
      throw safeRepairError('XLSX_UNCOMPRESSED_SIZE_LIMIT_EXCEEDED');
    }
  }
}

async function assertWorksheetsDoNotReferenceSharedStrings(zip) {
  const worksheetEntries = Object.values(zip.files).filter(
    (entry) => !entry.dir && /^xl\/worksheets\/sheet\d+\.xml$/u.test(entry.name)
  );
  for (const entry of worksheetEntries) {
    const xml = await entry.async('string');
    if (/<(?:[A-Za-z_][\w.-]*:)?c\b[^>]*\bt\s*=\s*["']s["']/u.test(xml)) {
      throw safeRepairError('EMPTY_SHARED_STRINGS_HAS_CELL_REFERENCES');
    }
  }
}

async function normalizeSupportedMainNamespaceEntries(zip) {
  const namespaceDeclaration = new RegExp(
    `xmlns:x\\s*=\\s*(["'])${escapeRegExp(OOXML_SPREADSHEET_NAMESPACE)}\\1`,
    'gu'
  );
  const entries = Object.values(zip.files).filter(
    (entry) => !entry.dir && entry.name.endsWith('.xml') && entry.name !== SHARED_STRINGS_PATH
  );
  for (const entry of entries) {
    const xml = await entry.async('string');
    if (!namespaceDeclaration.test(xml)) {
      namespaceDeclaration.lastIndex = 0;
      continue;
    }
    namespaceDeclaration.lastIndex = 0;
    if (!PREFIX_NORMALIZATION_PATH.test(entry.name)) {
      throw safeRepairError('UNSUPPORTED_PREFIXED_OOXML_ENTRY');
    }
    if (!/^\s*(?:<\?xml\s+[^?]*\?>\s*)?<x:[A-Za-z_][\w.-]*/u.test(xml)) {
      throw safeRepairError('PREFIXED_OOXML_ROOT_NOT_RECOGNIZED');
    }

    const declarations = [...xml.matchAll(/xmlns:x\s*=\s*["']([^"']+)["']/gu)];
    if (
      declarations.length !== 1
      || declarations[0][1] !== OOXML_SPREADSHEET_NAMESPACE
    ) {
      throw safeRepairError('PREFIXED_OOXML_NAMESPACE_REDECLARATION');
    }
    const normalized = xml
      .replace(namespaceDeclaration, (_match, quote) => `xmlns=${quote}${OOXML_SPREADSHEET_NAMESPACE}${quote}`)
      .replace(/<(\/?)x:([A-Za-z_][\w.-]*)(?=[\s/>])/gu, '<$1$2');
    namespaceDeclaration.lastIndex = 0;
    if (/<\/?x:[A-Za-z_]/u.test(normalized)) {
      throw safeRepairError('PREFIXED_OOXML_TAG_REMAINS');
    }
    zip.file(entry.name, normalized, {
      date: entry.date,
      compression: 'DEFLATE'
    });
  }
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

function safeRepairError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function readConfiguredSheet(worksheet, configuredName, spec) {
  const header = detectHeader(worksheet, spec);
  if (!header) {
    return {
      name: configuredName,
      present: true,
      headerRowNumber: null,
      headerError: 'HEADER_NOT_FOUND',
      rows: []
    };
  }

  const rows = [];
  const lastRow = Math.max(worksheet.actualRowCount, worksheet.rowCount);
  for (let rowNumber = header.rowNumber + 1; rowNumber <= lastRow; rowNumber += 1) {
    const worksheetRow = worksheet.getRow(rowNumber);
    const values = {};
    const raw = {};
    const formulaFields = [];
    let hasAnyFormula = false;

    for (const [logicalField, columnNumber] of Object.entries(header.logicalColumns)) {
      const cell = worksheetRow.getCell(columnNumber);
      const extracted = extractCell(cell);
      values[logicalField] = extracted.value;
      if (extracted.isFormula) {
        formulaFields.push(logicalField);
        hasAnyFormula = true;
      }
    }

    for (const [columnNumberString, headerName] of Object.entries(header.rawColumns)) {
      const columnNumber = Number(columnNumberString);
      const extracted = extractCell(worksheetRow.getCell(columnNumber));
      if (extracted.isFormula) hasAnyFormula = true;
      if (isMeaningful(extracted.value)) raw[headerName] = extracted.value;
    }

    rows.push({ rowNumber, values, raw, formulaFields, hasAnyFormula });
  }

  return {
    name: configuredName,
    present: true,
    headerRowNumber: header.rowNumber,
    rows
  };
}

function detectHeader(worksheet, spec) {
  const aliasesByField = Object.fromEntries(
    Object.entries(spec.fields).map(([field, aliases]) => [
      field,
      new Set(aliases.map(normalizeHeader).filter(Boolean))
    ])
  );
  const scanRows = Math.min(spec.headerScanRows ?? 30, worksheet.rowCount);
  let best = null;

  for (let rowNumber = 1; rowNumber <= scanRows; rowNumber += 1) {
    const row = worksheet.getRow(rowNumber);
    const rawColumns = {};
    const normalizedColumns = new Map();
    const lastColumn = Math.max(row.actualCellCount, worksheet.columnCount);

    for (let columnNumber = 1; columnNumber <= lastColumn; columnNumber += 1) {
      const headerValue = cleanText(extractCell(row.getCell(columnNumber)).value);
      if (!headerValue) continue;
      const uniqueHeader = uniqueHeaderName(headerValue, rawColumns);
      rawColumns[columnNumber] = uniqueHeader;
      const normalized = normalizeHeader(headerValue);
      if (normalized && !normalizedColumns.has(normalized)) {
        normalizedColumns.set(normalized, columnNumber);
      }
    }

    const logicalColumns = {};
    for (const [field, aliases] of Object.entries(aliasesByField)) {
      for (const alias of aliases) {
        const columnNumber = normalizedColumns.get(alias);
        if (columnNumber) {
          logicalColumns[field] = columnNumber;
          break;
        }
      }
    }
    const score = Object.keys(logicalColumns).length;
    if (!best || score > best.score) {
      best = { rowNumber, logicalColumns, rawColumns, score };
    }
  }

  return best && best.score >= (spec.minimumHeaderMatches ?? 1) ? best : null;
}

function extractCell(cell) {
  const raw = cell?.value;
  if (raw === null || raw === undefined) return { value: null, isFormula: false };
  if (raw instanceof Date) return { value: raw, isFormula: false };
  if (typeof raw !== 'object') return { value: raw, isFormula: false };

  if (Object.hasOwn(raw, 'formula') || Object.hasOwn(raw, 'sharedFormula')) {
    return { value: normalizeObjectCellValue(raw.result), isFormula: true };
  }
  return { value: normalizeObjectCellValue(raw), isFormula: false };
}

function normalizeObjectCellValue(value) {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value;
  if (typeof value !== 'object') return value;
  if (Array.isArray(value.richText)) return value.richText.map((part) => part.text ?? '').join('');
  if (Object.hasOwn(value, 'text')) return value.text;
  if (Object.hasOwn(value, 'result')) return normalizeObjectCellValue(value.result);
  if (Object.hasOwn(value, 'error')) return null;
  return null;
}

function uniqueHeaderName(header, rawColumns) {
  const used = new Set(Object.values(rawColumns));
  if (!used.has(header)) return header;
  let suffix = 2;
  while (used.has(`${header}__${suffix}`)) suffix += 1;
  return `${header}__${suffix}`;
}
