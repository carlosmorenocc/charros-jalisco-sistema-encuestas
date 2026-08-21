function escapeCell(value) {
  if (value === null || value === undefined) return '';
  let text = value instanceof Date ? value.toISOString() : String(value);
  // Prevent spreadsheet formula injection in exported user-controlled values.
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  if (/[",\r\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

export function rowsToCsv(rows, columns) {
  const header = columns.map((column) => escapeCell(column.label)).join(',');
  const lines = rows.map((row) => columns.map((column) => escapeCell(row[column.key])).join(','));
  return `\uFEFF${[header, ...lines].join('\r\n')}\r\n`;
}
