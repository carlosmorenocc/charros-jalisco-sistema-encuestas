import ExcelJS from 'exceljs';

const HEADER_FILL = 'FF0B4F8A';
const HEADER_FONT = { color: { argb: 'FFFFFFFF' }, bold: true };

function safe(value) {
  if (value == null) return '';
  const text = String(value);
  return /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
}

function isoDate(value) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? safe(value) : date.toISOString().slice(0, 10);
}

function segmentLabel(value) {
  return ({ VIP: 'VIP', Preferente: 'PREFERENTE', General: 'GRAL', Compromisos: 'COMPROMISO' })[value]
    || safe(value).toLocaleUpperCase('es-MX');
}

function orderStatus(value) {
  return ({ reserved: 'APARTADA', confirmed: 'CONFIRMADA', cancelled: 'ANULADA', refunded: 'REEMBOLSADA' })[value]
    || safe(value).toLocaleUpperCase('es-MX');
}

function styleSheet(sheet) {
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  sheet.autoFilter = { from: 'A1', to: sheet.getRow(1).getCell(sheet.columnCount).address };
  sheet.getRow(1).height = 24;
  sheet.getRow(1).eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL } };
    cell.font = HEADER_FONT;
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
  });
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber > 1) row.alignment = { vertical: 'top' };
  });
}

export async function subscriberWorkbookBuffer({ holders, seats }) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'CRM Abonados Charros de Jalisco';
  workbook.created = new Date();
  workbook.modified = new Date();

  const holderSheet = workbook.addWorksheet('Titulares');
  holderSheet.columns = [
    { header: 'ID titular CRM', key: 'contactId', width: 38 },
    { header: 'Titular', key: 'name', width: 34 },
    { header: 'Correo', key: 'email', width: 32 },
    { header: 'Telefono', key: 'phone', width: 18 },
    { header: 'Estatus abonado', key: 'subscriberStatus', width: 20 },
    { header: 'Cuenta en Titulares identificados', key: 'identified', width: 28 },
    { header: 'Ejecutivo', key: 'executive', width: 24 },
    { header: 'Segmento', key: 'segment', width: 16 },
    { header: 'Localidad', key: 'locality', width: 25 },
    { header: 'Cantidad de abonos', key: 'seatCount', width: 19 },
    { header: 'Butacas', key: 'seats', width: 42 },
    { header: 'Estatus membresia', key: 'membershipStatus', width: 19 },
    { header: 'Numero de orden', key: 'orders', width: 19 },
    { header: 'Fecha de venta', key: 'saleAt', width: 17 }
  ];
  holderSheet.addRows(holders.map((row) => ({
    contactId: safe(row.contact_id), name: safe(row.name), email: safe(row.email), phone: safe(row.phone),
    subscriberStatus: safe(row.subscriber_status), identified: safe(row.counts_as_identified_holder),
    executive: safe(row.executive_name), segment: segmentLabel(row.segment), locality: safe(row.locality),
    seatCount: Number(row.seat_count || 0), seats: safe(row.seats), membershipStatus: safe(row.membership_status),
    orders: safe(row.orders), saleAt: isoDate(row.last_sale_at)
  })));
  styleSheet(holderSheet);

  const seatSheet = workbook.addWorksheet('Butacas');
  seatSheet.columns = [
    { header: 'Numero de orden', key: 'orderNumber', width: 19 },
    { header: 'Estado de orden', key: 'orderStatus', width: 18 },
    { header: 'Tipo de venta', key: 'saleType', width: 17 },
    { header: 'Titular', key: 'name', width: 34 },
    { header: 'Titular principal', key: 'primary', width: 18 },
    { header: 'Correo', key: 'email', width: 32 },
    { header: 'Telefono', key: 'phone', width: 18 },
    { header: 'Zona', key: 'segment', width: 16 },
    { header: 'Localidad original', key: 'locality', width: 25 },
    { header: 'Butaca', key: 'seat', width: 22 },
    { header: 'Numero dentro de la orden', key: 'unitNumber', width: 25 },
    { header: 'Talla de jersey', key: 'jersey', width: 17 },
    { header: 'Personalizacion-butaca', key: 'personalization', width: 28 },
    { header: 'Ejecutivo', key: 'executive', width: 24 },
    { header: 'Fecha de venta', key: 'soldAt', width: 17 },
    { header: 'Fuente', key: 'source', width: 16 },
    { header: 'ID contacto CRM', key: 'contactId', width: 38 },
    { header: 'ID asociacion', key: 'assignmentId', width: 38 }
  ];
  seatSheet.addRows(seats.map((row) => ({
    orderNumber: safe(row.order_number), orderStatus: orderStatus(row.order_status),
    saleType: row.sale_type === 'renewal' ? 'RENOVACION' : 'NUEVA', name: safe(row.name),
    primary: row.is_primary ? 'SI' : 'NO', email: safe(row.email), phone: safe(row.phone),
    segment: segmentLabel(row.segment), locality: safe(row.locality), seat: safe(row.seat_identifier),
    unitNumber: Number(row.unit_number || 0), jersey: safe(row.jersey_size),
    personalization: safe(row.seat_personalization), executive: safe(row.executive_name),
    soldAt: isoDate(row.sold_at), source: safe(row.source), contactId: safe(row.contact_id),
    assignmentId: safe(row.holder_assignment_id)
  })));
  styleSheet(seatSheet);

  return Buffer.from(await workbook.xlsx.writeBuffer());
}
