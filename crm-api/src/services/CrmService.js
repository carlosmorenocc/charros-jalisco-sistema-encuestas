import { badRequest, forbidden, notFound } from '../lib/errors.js';
import {
  PERMISSIONS,
  hasPermission,
  mayWriteContact,
  requirePermission
} from '../security/permissions.js';

export class CrmService {
  constructor(repository) {
    this.repository = repository;
  }

  async dashboard(actor, filters) {
    requirePermission(actor, PERMISSIONS.DASHBOARD_READ);
    return this.repository.dashboardSummary({ actor, filters });
  }

  async getSubscriptionPricingCatalog(actor) {
    requirePermission(actor, PERMISSIONS.CONTACT_READ);
    return this.repository.getSubscriptionPricingCatalog();
  }

  async quoteSubscription(actor, input) {
    requirePermission(actor, PERMISSIONS.CONTACT_READ);
    return this.repository.quoteSubscription(input);
  }

  async listContacts(actor, filters) {
    requirePermission(actor, PERMISSIONS.CONTACT_READ);
    if ((filters.includeDeleted || filters.deletedOnly)
      && !hasPermission(actor, PERMISSIONS.CONTACT_DELETE)
      && !hasPermission(actor, PERMISSIONS.CONTACT_RESTORE)) {
      throw forbidden('No puedes consultar registros eliminados.');
    }
    return this.repository.listContacts({ actor, filters });
  }

  async getContact(actor, id, options = {}) {
    requirePermission(actor, PERMISSIONS.CONTACT_READ);
    const contact = await this.repository.getContact(id, actor, options);
    if (!contact) throw notFound('Contacto');
    return contact;
  }

  async createContact(actor, data, context) {
    const canCreateAll = hasPermission(actor, PERMISSIONS.CONTACT_WRITE_ALL);
    const canCreateOwn = hasPermission(actor, PERMISSIONS.CONTACT_WRITE_ASSIGNED)
      && data.executiveId === actor.id;
    if (!canCreateAll && !canCreateOwn) throw forbidden('No puedes crear un contacto para esa cartera.');
    if (data.executiveId !== undefined && data.executiveId !== actor.id) {
      requirePermission(actor, PERMISSIONS.CONTACT_ASSIGN);
    }
    return this.repository.createContact(data, actor, context);
  }

  async createManualRegistration(actor, data, context, idempotency) {
    if (actor.role !== 'admin') throw forbidden('Solo el Administrador puede realizar altas manuales.');
    requirePermission(actor, PERMISSIONS.CONTACT_WRITE_ALL);
    requirePermission(actor, PERMISSIONS.MEMBERSHIP_WRITE);
    requirePermission(actor, PERMISSIONS.INTERACTION_WRITE);
    if (data.nextTask) requirePermission(actor, PERMISSIONS.TASK_WRITE_ALL);
    return this.repository.createManualRegistration(data, actor, context, idempotency);
  }

  async updateContact(actor, id, data, context, expectedVersion) {
    const contact = await this.getContact(actor, id);
    if (!mayWriteContact(actor, contact)) throw forbidden('Solo puedes editar contactos de tu cartera.');
    const finalEmail = data.email === undefined ? contact.email : data.email;
    const finalPhone = data.phone === undefined ? contact.phone : data.phone;
    if (!finalEmail && !finalPhone) throw badRequest('El contacto debe conservar al menos email o phone.');
    if (actor.role === 'executive') {
      const allowed = new Set([
        'firstName', 'lastName', 'email', 'phone', 'municipality',
        'commercialStage', 'preferredChannel', 'summaryNotes'
      ]);
      const restricted = Object.keys(data).filter((field) => !allowed.has(field));
      if (restricted.length) {
        throw forbidden(`Un Ejecutivo no puede editar: ${restricted.join(', ')}.`);
      }
    }
    if (data.executiveId !== undefined && data.executiveId !== contact.executiveId) {
      requirePermission(actor, PERMISSIONS.CONTACT_ASSIGN);
    }
    return this.repository.updateContact(id, data, actor, context, expectedVersion);
  }

  async deleteContact(actor, id, reason, context, expectedVersion) {
    requirePermission(actor, PERMISSIONS.CONTACT_DELETE);
    if (!reason || reason.trim().length < 5) throw badRequest('La eliminación requiere un motivo de al menos 5 caracteres.');
    return this.repository.softDeleteContact(id, reason.trim(), actor, context, expectedVersion);
  }

  async restoreContact(actor, id, context, expectedVersion) {
    requirePermission(actor, PERMISSIONS.CONTACT_RESTORE);
    return this.repository.restoreContact(id, actor, context, expectedVersion);
  }

  async listInteractions(actor, contactId) {
    requirePermission(actor, PERMISSIONS.CONTACT_READ);
    return this.repository.listInteractions(contactId, actor);
  }

  async createInteraction(actor, contactId, data, context) {
    requirePermission(actor, PERMISSIONS.INTERACTION_WRITE);
    const contact = await this.getContact(actor, contactId);
    if (!mayWriteContact(actor, contact) && !hasPermission(actor, PERMISSIONS.CONTACT_WRITE_ALL)) {
      throw forbidden('No puedes registrar actividad en este contacto.');
    }
    return this.repository.createInteraction(contactId, data, actor, context);
  }

  async listAllInteractions(actor, filters) {
    requirePermission(actor, PERMISSIONS.CONTACT_READ);
    return this.repository.listAllInteractions({ actor, filters });
  }

  async listMemberships(actor, contactId) {
    requirePermission(actor, PERMISSIONS.CONTACT_READ);
    return this.repository.listMemberships(contactId, actor);
  }

  async createMembership(actor, contactId, data, context) {
    requirePermission(actor, PERMISSIONS.MEMBERSHIP_WRITE);
    return this.repository.createMembership(contactId, data, actor, context);
  }

  async updateMembership(actor, id, data, context, expectedVersion) {
    requirePermission(actor, PERMISSIONS.MEMBERSHIP_WRITE);
    return this.repository.updateMembership(id, data, actor, context, expectedVersion);
  }

  async listTasks(actor, filters) {
    if (!hasPermission(actor, PERMISSIONS.TASK_WRITE_ASSIGNED)
      && !hasPermission(actor, PERMISSIONS.TASK_WRITE_ALL)
      && !hasPermission(actor, PERMISSIONS.CONTACT_READ)) {
      throw forbidden();
    }
    return this.repository.listTasks({ actor, filters });
  }

  async listContactTasks(actor, contactId, filters) {
    await this.getContact(actor, contactId);
    return this.listTasks(actor, { ...filters, contactId });
  }

  async createTask(actor, contactId, data, context) {
    const all = hasPermission(actor, PERMISSIONS.TASK_WRITE_ALL);
    const own = hasPermission(actor, PERMISSIONS.TASK_WRITE_ASSIGNED) && data.assignedTo === actor.id;
    if (!all && !own) throw forbidden('Solo puedes asignarte tareas a ti mismo.');
    return this.repository.createTask(contactId, data, actor, context);
  }

  async updateTask(actor, id, data, context, expectedVersion) {
    const all = hasPermission(actor, PERMISSIONS.TASK_WRITE_ALL);
    const own = hasPermission(actor, PERMISSIONS.TASK_WRITE_ASSIGNED);
    if (!all && !own) throw forbidden();
    const existing = await this.repository.getTask(id, actor);
    if (!existing) throw notFound('Tarea');
    if (!all && existing.assignedTo !== actor.id) {
      throw forbidden('Solo puedes actualizar tareas asignadas a ti.');
    }
    if (!all && data.assignedTo && data.assignedTo !== actor.id) {
      throw forbidden('Solo puedes asignarte tareas a ti mismo.');
    }
    return this.repository.updateTask(id, data, actor, context, expectedVersion);
  }

  async listSales(actor, filters) {
    requirePermission(actor, PERMISSIONS.SALES_READ);
    return this.repository.listSales({ actor, filters });
  }

  async createSale(actor, data, context) {
    requirePermission(actor, PERMISSIONS.SALES_WRITE);
    return this.repository.createSale(data, actor, context);
  }

  async getSale(actor, id) {
    requirePermission(actor, PERMISSIONS.SALES_READ);
    const sale = await this.repository.getSale(id, actor);
    if (!sale) throw notFound('Venta');
    return sale;
  }

  async addPayment(actor, saleId, data, context) {
    requirePermission(actor, PERMISSIONS.SALES_WRITE);
    return this.repository.addPayment(saleId, data, actor, context);
  }

  async listExecutives(actor, filters) {
    if (!hasPermission(actor, PERMISSIONS.CONTACT_ASSIGN)
      && !hasPermission(actor, PERMISSIONS.DASHBOARD_READ)) {
      throw forbidden('No puedes consultar el directorio de ejecutivos.');
    }
    return this.repository.listExecutives(filters);
  }

  async exportContacts(actor, filters, context) {
    requirePermission(actor, PERMISSIONS.DATA_EXPORT);
    return this.repository.exportContacts({ actor, filters, context });
  }

  async recordDashboardPdfExport(actor, event, context) {
    requirePermission(actor, PERMISSIONS.DASHBOARD_READ);
    return this.repository.recordDashboardPdfExport(actor, event, context);
  }

  async listAudit(actor, filters) {
    requirePermission(actor, PERMISSIONS.AUDIT_READ);
    return this.repository.listAuditEvents(filters);
  }
}
