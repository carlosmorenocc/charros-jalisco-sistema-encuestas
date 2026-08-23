import { createHash, randomUUID } from 'node:crypto';
import { badRequest } from './errors.js';

const EXPECTED = Object.freeze({ contacts: 326, memberships: 166, units: 494, sales: 172 });
const SOURCE = 'BOLETOMOVIL_LMP_2026_27_AUDITED';

const clean = (value) => String(value ?? '').trim();
const key = (value) => clean(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();

function splitName(value) {
  const parts = clean(value).toUpperCase().split(/\s+/).filter(Boolean);
  return { firstName: parts.shift() || 'SIN NOMBRE', lastName: parts.join(' ') || 'SIN APELLIDO' };
}

function status(value) {
  if (value === 'Abonado nuevo') return 'new_subscriber';
  if (value === 'Abonado actual') return 'current_subscriber';
  if (value === 'Por renovar') return 'renewing';
  throw badRequest(`Tipo de titular no reconocido: ${value}`);
}

function stage(value) {
  if (value === 'Ganado') return 'won';
  if (value === 'Seguimiento') return 'follow_up';
  if (value === 'Por contactar') return 'to_contact';
  throw badRequest(`Etapa comercial no reconocida: ${value}`);
}

function executiveCode(value) {
  const normalized = key(value);
  if (normalized.includes('ESMERALDA')) return 'esmeralda';
  if (normalized.includes('JESUS')) return 'jesus';
  if (normalized.includes('ROSA')) return 'rosana';
  return null;
}

function distance(left, right) {
  const a = key(left); const b = key(right);
  const row = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    let prior = row[0]; row[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const saved = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prior + (a[i - 1] === b[j - 1] ? 0 : 1));
      prior = saved;
    }
  }
  return row[b.length];
}

function closestContact(name, contacts) {
  const exact = contacts.find((contact) => key(contact.fullName) === key(name));
  if (exact) return exact;
  return contacts.map((contact) => ({ contact, score: distance(name, contact.fullName) }))
    .sort((left, right) => left.score - right.score)[0]?.contact;
}

export function normalizeOperationalDataset(input) {
  const sourceContacts = Array.isArray(input?.demoContacts) ? input.demoContacts : [];
  const sourceSales = Array.isArray(input?.demoSales) ? input.demoSales : [];
  if (sourceContacts.length !== EXPECTED.contacts || sourceSales.length !== EXPECTED.sales) {
    throw badRequest('El archivo no corresponde al corte auditado aprobado (326 titulares y 172 órdenes).');
  }

  const contacts = sourceContacts.map((item) => {
    const names = splitName(item.name);
    return {
      id: randomUUID(), externalRef: `LMP2627:${clean(item.id)}`, fullName: clean(item.name).toUpperCase(),
      ...names, email: clean(item.email).toLowerCase() || null, phone: clean(item.phone) || null,
      subscriberStatus: status(item.type), commercialStage: stage(item.stage),
      executiveCode: executiveCode(item.executive), isCommitmentOnly: Boolean(item.isCommitmentOnly),
      renewalDate: clean(item.renewalDate) || null, notes: clean(item.note),
      membership: Number(item.seats || 0) > 0 && item.currentMembership ? item.currentMembership : null,
    };
  });

  const memberships = [];
  const units = [];
  for (const contact of contacts) {
    if (!contact.membership) continue;
    const membershipId = randomUUID();
    const sourceUnits = Array.isArray(contact.membership.units) ? contact.membership.units : [];
    const segment = clean(contact.membership.membershipSegment || contact.membership.membershipSection) || 'General';
    memberships.push({
      id: membershipId, contactId: contact.id, seatCount: sourceUnits.length,
      zone: clean(contact.membership.zone) || null, product: clean(contact.membership.product) || null,
      section: segment === 'Compromisos' ? 'VIP' : segment,
      renewalDate: contact.renewalDate,
    });
    sourceUnits.forEach((unit, index) => units.push({
      id: randomUUID(), membershipId, unitNumber: index + 1,
      seatIdentifier: clean(unit.seatIdentifier) || null,
      zone: clean(contact.membership.zone) || null, product: clean(contact.membership.product) || null,
    }));
  }

  const sales = sourceSales.map((item) => {
    const contact = closestContact(item.contact, contacts);
    return {
      id: randomUUID(), externalRef: clean(item.id), contactId: contact?.id,
      executiveCode: executiveCode(item.owner), soldAt: clean(item.occurredAt),
      total: Number(item.total || 0), paid: Number(item.paid || 0), seats: Number(item.seats || 0),
      zone: clean(item.zone) || null, kind: clean(item.kind) || 'ABONO',
    };
  });

  const metrics = { contacts: contacts.length, memberships: memberships.length, units: units.length, sales: sales.length };
  for (const [metric, expected] of Object.entries(EXPECTED)) {
    if (metrics[metric] !== expected) throw badRequest(`El corte auditado no concilia: ${metric}=${metrics[metric]}, esperado=${expected}.`);
  }
  if (contacts.filter((item) => item.isCommitmentOnly).length !== 3) throw badRequest('El corte debe contener exactamente 3 titulares de Compromisos.');
  if (units.filter((unit) => unit.seatIdentifier).length !== EXPECTED.units) throw badRequest('Todas las butacas deben tener identificador.');
  if (sales.some((sale) => !sale.contactId || !sale.soldAt)) throw badRequest('Todas las órdenes deben vincularse a un titular y una fecha.');

  const datasetSha256 = createHash('sha256').update(JSON.stringify(input)).digest('hex');
  return { source: SOURCE, datasetSha256, metrics, contacts, memberships, units, sales };
}
