import express from 'express';
import { asyncHandler, paginationMeta, requireRowVersion } from './lib/http.js';
import {
  parseListQuery,
  validateContact,
  validateDashboardPdfEvent,
  validateInteraction,
  validateManualRegistration,
  validateMembershipCreation,
  validateMembershipSeatAssignment,
  validateSubscriptionQuote,
  validateTask,
  validateUuid
} from './lib/validation.js';
import { rowsToCsv } from './lib/csv.js';
import { badRequest } from './lib/errors.js';
import { effectivePermissions } from './security/permissions.js';
import { requestBodyHash } from './lib/idempotency.js';

function data(res, value, status = 200, meta = undefined) {
  return res.status(status).json({ data: value, ...(meta ? { meta } : {}) });
}

function parseAuditQuery(query) {
  const list = parseListQuery(query);
  const entityType = query.entityType === undefined ? undefined : String(query.entityType).trim();
  if (entityType && !/^[a-z_]{1,50}$/.test(entityType)) throw badRequest('entityType no es válido.');
  return {
    page: list.page,
    pageSize: list.pageSize,
    actorId: query.actorId ? validateUuid(query.actorId, 'actorId') : undefined,
    entityType
  };
}

export function createApiRouter({ service, config }) {
  const router = express.Router();

  router.get('/me', (req, res) => data(res, {
    id: req.actor.id,
    email: req.actor.email,
    displayName: req.actor.displayName,
    role: req.actor.role,
    permissions: [...effectivePermissions(req.actor)].sort()
  }));

  router.get('/dashboard/summary', asyncHandler(async (req, res) => {
    const filters = parseListQuery(req.query);
    data(res, await service.dashboard(req.actor, filters));
  }));

  router.get('/pricing/subscriptions/catalog', asyncHandler(async (req, res) => {
    data(res, await service.getSubscriptionPricingCatalog(req.actor));
  }));

  router.get('/pricing/subscriptions/quote', asyncHandler(async (req, res) => {
    data(res, await service.quoteSubscription(req.actor, validateSubscriptionQuote(req.query)));
  }));

  router.post('/manual-registrations', asyncHandler(async (req, res) => {
    const idempotencyKey = validateUuid(req.get('idempotency-key'), 'Idempotency-Key');
    const registration = validateManualRegistration(req.body, { defaultAssigneeId: req.actor.id });
    const result = await service.createManualRegistration(
      req.actor,
      registration,
      req.auditContext,
      { idempotencyKey, requestHash: requestBodyHash(req.body, config.sessionHashKey) }
    );
    res.setHeader('etag', `"${result.contact.rowVersion}"`);
    res.setHeader('idempotency-replayed', String(result.replayed));
    data(res, result, result.replayed ? 200 : 201);
  }));

  router.get('/contacts', asyncHandler(async (req, res) => {
    const filters = parseListQuery(req.query);
    const result = await service.listContacts(req.actor, filters);
    data(res, result.items, 200, paginationMeta(filters.page, filters.pageSize, result.total));
  }));

  router.post('/contacts', asyncHandler(async (req, res) => {
    const created = await service.createContact(req.actor, validateContact(req.body), req.auditContext);
    res.setHeader('etag', `"${created.rowVersion}"`);
    data(res, created, 201);
  }));

  router.get('/contacts/:id', asyncHandler(async (req, res) => {
    const contact = await service.getContact(req.actor, validateUuid(req.params.id));
    res.setHeader('etag', `"${contact.rowVersion}"`);
    data(res, contact);
  }));

  router.patch('/contacts/:id', asyncHandler(async (req, res) => {
    const updated = await service.updateContact(
      req.actor,
      validateUuid(req.params.id),
      validateContact(req.body, { partial: true }),
      req.auditContext,
      requireRowVersion(req)
    );
    res.setHeader('etag', `"${updated.rowVersion}"`);
    data(res, updated);
  }));

  router.delete('/contacts/:id', asyncHandler(async (req, res) => {
    const deleted = await service.deleteContact(
      req.actor,
      validateUuid(req.params.id),
      String(req.body?.reason ?? ''),
      req.auditContext,
      requireRowVersion(req)
    );
    res.setHeader('etag', `"${deleted.rowVersion}"`);
    data(res, deleted);
  }));

  router.post('/contacts/:id/restore', asyncHandler(async (req, res) => {
    const restored = await service.restoreContact(
      req.actor,
      validateUuid(req.params.id),
      req.auditContext,
      requireRowVersion(req)
    );
    res.setHeader('etag', `"${restored.rowVersion}"`);
    data(res, restored);
  }));

  router.get('/contacts/:id/interactions', asyncHandler(async (req, res) => {
    data(res, await service.listInteractions(req.actor, validateUuid(req.params.id)));
  }));

  router.post('/contacts/:id/interactions', asyncHandler(async (req, res) => {
    data(res, await service.createInteraction(
      req.actor,
      validateUuid(req.params.id),
      validateInteraction(req.body),
      req.auditContext
    ), 201);
  }));

  router.get('/interactions', asyncHandler(async (req, res) => {
    const filters = parseListQuery(req.query);
    const result = await service.listAllInteractions(req.actor, filters);
    data(res, result.items, 200, paginationMeta(filters.page, filters.pageSize, result.total));
  }));

  router.get('/contacts/:id/memberships', asyncHandler(async (req, res) => {
    data(res, await service.listMemberships(req.actor, validateUuid(req.params.id)));
  }));

  router.post('/contacts/:id/memberships', asyncHandler(async (req, res) => {
    const created = await service.createMembership(
      req.actor,
      validateUuid(req.params.id),
      validateMembershipCreation(req.body),
      req.auditContext
    );
    res.setHeader('etag', `"${created.rowVersion}"`);
    data(res, created, 201);
  }));

  router.patch('/memberships/:id', asyncHandler(async (req, res) => {
    const updated = await service.updateMembership(
      req.actor,
      validateUuid(req.params.id),
      validateMembershipSeatAssignment(req.body),
      req.auditContext,
      requireRowVersion(req)
    );
    res.setHeader('etag', `"${updated.rowVersion}"`);
    data(res, updated);
  }));

  router.get('/tasks', asyncHandler(async (req, res) => {
    const filters = parseListQuery(req.query);
    const result = await service.listTasks(req.actor, filters);
    data(res, result.items, 200, paginationMeta(filters.page, filters.pageSize, result.total));
  }));

  router.get('/contacts/:id/tasks', asyncHandler(async (req, res) => {
    const contactId = validateUuid(req.params.id);
    const filters = parseListQuery(req.query);
    const result = await service.listContactTasks(req.actor, contactId, filters);
    data(res, result.items, 200, paginationMeta(filters.page, filters.pageSize, result.total));
  }));

  router.post('/contacts/:id/tasks', asyncHandler(async (req, res) => {
    const created = await service.createTask(
      req.actor,
      validateUuid(req.params.id),
      validateTask(req.body),
      req.auditContext
    );
    res.setHeader('etag', `"${created.rowVersion}"`);
    data(res, created, 201);
  }));

  router.patch('/tasks/:id', asyncHandler(async (req, res) => {
    const updated = await service.updateTask(
      req.actor,
      validateUuid(req.params.id),
      validateTask(req.body, { partial: true }),
      req.auditContext,
      requireRowVersion(req)
    );
    res.setHeader('etag', `"${updated.rowVersion}"`);
    data(res, updated);
  }));

  router.get('/sales', asyncHandler(async (req, res) => {
    const filters = parseListQuery(req.query);
    const result = await service.listSales(req.actor, filters);
    data(res, result.items, 200, paginationMeta(filters.page, filters.pageSize, result.total));
  }));

  router.get('/sales/:id', asyncHandler(async (req, res) => {
    data(res, await service.getSale(req.actor, validateUuid(req.params.id)));
  }));

  router.get('/executives', asyncHandler(async (req, res) => {
    let active = true;
    if (req.query.active !== undefined) {
      if (!['true', 'false'].includes(req.query.active)) throw badRequest('active debe ser true o false.');
      active = req.query.active === 'true';
    }
    data(res, await service.listExecutives(req.actor, { active }));
  }));

  router.get('/exports/contacts.csv', asyncHandler(async (req, res) => {
    const filters = parseListQuery(req.query);
    const rows = await service.exportContacts(req.actor, filters, req.auditContext);
    const csv = rowsToCsv(rows, [
      { key: 'id', label: 'ID' }, { key: 'name', label: 'Nombre' },
      { key: 'email', label: 'Correo' }, { key: 'phone', label: 'Teléfono' },
      { key: 'municipality', label: 'Municipio' },
      { key: 'subscriber_status', label: 'Estatus abonado' },
      { key: 'commercial_stage', label: 'Etapa comercial' },
      { key: 'executive_name', label: 'Ejecutivo' },
      { key: 'last_human_contact_at', label: 'Último contacto humano' },
      { key: 'last_human_contact_channel', label: 'Canal del último contacto' },
      { key: 'next_follow_up_at', label: 'Próximo seguimiento' },
      { key: 'consent_status', label: 'Consentimiento' },
      { key: 'membership_section', label: 'Sección' },
      { key: 'membership_seat_count', label: 'Cantidad de abonos' },
      { key: 'membership_seats', label: 'Butacas' },
      { key: 'membership_locality_name', label: 'Localidad' },
      { key: 'membership_discount_name', label: 'Descuento' },
      { key: 'membership_list_unit_price', label: 'Precio de lista unitario (MXN)' },
      { key: 'membership_commercial_value', label: 'Valor comercial (MXN)' },
      { key: 'membership_net_amount', label: 'Importe neto (MXN)' },
      { key: 'membership_discount_amount', label: 'Descuento aplicado (MXN)' },
      { key: 'membership_effective_unit_price', label: 'Precio unitario efectivo (MXN)' },
      { key: 'membership_charged_units', label: 'Unidades con cargo' },
      { key: 'membership_bonus_units', label: 'Unidades bonificadas' },
      { key: 'membership_price_book_version', label: 'Version de precios' },
      { key: 'membership_currency', label: 'Moneda' }
    ]);
    res.type('text/csv; charset=utf-8');
    res.setHeader('content-disposition', 'attachment; filename="contactos-crm.csv"');
    res.send(csv);
  }));

  router.post('/exports/dashboard-pdf-events', asyncHandler(async (req, res) => {
    await service.recordDashboardPdfExport(
      req.actor,
      validateDashboardPdfEvent(req.body),
      req.auditContext
    );
    res.status(204).end();
  }));

  router.get('/audit', asyncHandler(async (req, res) => {
    const filters = parseAuditQuery(req.query);
    const result = await service.listAudit(req.actor, filters);
    data(res, result.items, 200, paginationMeta(filters.page, filters.pageSize, result.total));
  }));

  return router;
}
