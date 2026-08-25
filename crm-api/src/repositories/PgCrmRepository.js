import { withTransaction } from '../db/pool.js';
import { badRequest, conflict, duplicateContact, notFound } from '../lib/errors.js';
import {
  calculateMembershipPrice,
  MEMBERSHIP_PRICING_SEASON
} from '../lib/membershipPricing.js';

function moneyFromCents(value) {
  return value == null ? null : Number(value) / 100;
}

function membershipPricingFields(row, prefix = '') {
  const field = (name) => row[`${prefix}${name}`];
  return {
    priceBookVersion: field('price_book_version') ?? null,
    currency: field('currency') ?? null,
    localityCode: field('locality_code') ?? null,
    localityName: field('locality_name') ?? null,
    discountCode: field('discount_code') ?? null,
    discountName: field('discount_name') ?? null,
    pricingMode: field('pricing_mode') ?? null,
    listUnitPrice: moneyFromCents(field('list_unit_price')),
    commercialValue: moneyFromCents(field('commercial_value')),
    netAmount: moneyFromCents(field('net_amount')),
    discountAmount: moneyFromCents(field('discount_amount')),
    effectiveUnitPrice: moneyFromCents(field('effective_unit_price')),
    chargedUnits: field('charged_units') == null ? null : Number(field('charged_units')),
    bonusUnits: field('bonus_units') == null ? null : Number(field('bonus_units'))
  };
}

function publicPricing(snapshot) {
  return {
    ...snapshot,
    listUnitPrice: moneyFromCents(snapshot.listUnitPrice),
    commercialValue: moneyFromCents(snapshot.commercialValue),
    netAmount: moneyFromCents(snapshot.netAmount),
    discountAmount: moneyFromCents(snapshot.discountAmount),
    effectiveUnitPrice: moneyFromCents(snapshot.effectiveUnitPrice)
  };
}

function contactRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    externalRef: row.external_ref,
    firstName: row.first_name,
    lastName: row.last_name,
    displayName: `${row.first_name} ${row.last_name}`.trim(),
    email: row.email,
    phone: row.phone,
    municipality: row.municipality,
    subscriberStatus: row.subscriber_status,
    commercialStage: row.commercial_stage,
    preferredChannel: row.preferred_channel,
    executiveId: row.executive_id,
    executiveName: row.executive_name,
    source: row.source,
    acquisitionSource: row.acquisition_source,
    consentStatus: row.consent_status,
    consentAt: row.consent_at,
    privacyNoticeVersion: row.privacy_notice_version,
    summaryNotes: row.summary_notes,
    lastHumanContactAt: row.last_human_contact_at,
    lastHumanContactChannel: row.last_human_contact_channel,
    nextFollowUpAt: row.next_follow_up_at,
    seatCount: Number(row.seat_count ?? 0),
    managedSeatCount: Number(row.managed_seat_count ?? row.seat_count ?? 0),
    seasonsCount: Number(row.seasons_count ?? 0),
    declaredTenureSeasons: row.declared_tenure_seasons == null
      ? null
      : Number(row.declared_tenure_seasons),
    nextTaskAt: row.next_task_at,
    overdueTasks: Number(row.overdue_tasks ?? 0),
    membershipId: row.membership_id ?? null,
    membershipStatus: row.membership_status ?? null,
    membershipSection: row.membership_section ?? null,
    membershipSeatCount: row.membership_seat_count == null
      ? null
      : Number(row.membership_seat_count),
    membershipSeats: Array.isArray(row.membership_seats)
      ? row.membership_seats.filter((seat) => typeof seat === 'string')
      : [],
    membershipRowVersion: row.membership_row_version == null
      ? null
      : Number(row.membership_row_version),
    membershipPriceBookVersion: row.membership_price_book_version ?? null,
    membershipCurrency: row.membership_currency ?? null,
    membershipLocalityCode: row.membership_locality_code ?? null,
    membershipLocalityName: row.membership_locality_name ?? null,
    membershipDiscountCode: row.membership_discount_code ?? null,
    membershipDiscountName: row.membership_discount_name ?? null,
    membershipPricingMode: row.membership_pricing_mode ?? null,
    membershipListUnitPrice: moneyFromCents(row.membership_list_unit_price),
    membershipCommercialValue: moneyFromCents(row.membership_commercial_value),
    membershipNetAmount: moneyFromCents(row.membership_net_amount),
    membershipDiscountAmount: moneyFromCents(row.membership_discount_amount),
    membershipEffectiveUnitPrice: moneyFromCents(row.membership_effective_unit_price),
    membershipChargedUnits: row.membership_charged_units == null
      ? null : Number(row.membership_charged_units),
    membershipBonusUnits: row.membership_bonus_units == null
      ? null : Number(row.membership_bonus_units),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
    rowVersion: Number(row.row_version)
  };
}

function userRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    role: row.role,
    active: row.active,
    lastLoginAt: row.last_login_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    rowVersion: Number(row.row_version),
    permissionGrants: row.permission_grants ?? []
  };
}

function interactionRow(row) {
  return {
    id: row.id,
    contactId: row.contact_id,
    actorId: row.actor_id,
    actorName: row.actor_name,
    occurredAt: row.occurred_at,
    channel: row.channel,
    outcome: row.outcome,
    notes: row.notes,
    isHumanContact: row.is_human_contact,
    createdAt: row.created_at,
    voidedAt: row.voided_at
  };
}

function taskRow(row) {
  return {
    id: row.id,
    contactId: row.contact_id,
    contactName: row.contact_name,
    assignedTo: row.assigned_to,
    assigneeName: row.assignee_name,
    description: row.description,
    dueAt: row.due_at,
    priority: row.priority,
    status: row.status,
    completedAt: row.completed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    rowVersion: Number(row.row_version)
  };
}

function membershipRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    contactId: row.contact_id,
    seasonCode: row.season_code,
    membershipStatus: row.membership_status,
    seatCount: Number(row.seat_count),
    seatIdentifier: row.seat_identifier,
    zone: row.zone,
    section: row.section,
    product: row.product,
    startDate: row.start_date,
    renewalDate: row.renewal_date,
    ...membershipPricingFields(row),
    units: row.units ?? [],
    rowVersion: Number(row.row_version)
  };
}

function membershipUnitRow(row) {
  return {
    id: row.id,
    unitNumber: Number(row.unit_number),
    seatIdentifier: row.seat_identifier,
    zone: row.zone,
    product: row.product,
    jerseySize: row.jersey_size
  };
}

function saleRow(row) {
  const totalAmount = Number(row.effective_total_amount ?? row.total_amount);
  return {
    id: row.id,
    externalOrderNumber: row.effective_external_order_number ?? row.external_order_number,
    saleType: row.effective_sale_type ?? row.sale_type,
    contactId: row.effective_contact_id ?? row.contact_id,
    contactName: row.contact_name,
    executiveId: row.effective_executive_id ?? row.executive_id,
    executiveName: row.executive_name,
    seasonCode: row.season_code,
    status: row.effective_status ?? row.status,
    soldAt: row.effective_sold_at ?? row.sold_at,
    currency: row.currency,
    totalAmount,
    paidAmount: Number(row.paid_amount),
    balanceAmount: totalAmount - Number(row.paid_amount),
    notes: row.effective_notes ?? row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    rowVersion: Number(row.row_version),
    items: row.effective_items ?? row.items ?? [],
    correctionId: row.correction_id ?? null,
    correctionReason: row.correction_reason ?? null,
    correctedAt: row.corrected_at ?? null,
    payments: row.payments ?? []
  };
}

function saleItemsFromPricing(data, pricing) {
  if (!pricing) return data.items;
  const product = data.saleType === 'renewal' ? 'RENOVACIÓN DE ABONO' : 'ABONO NUEVO';
  const suffix = ` · DESCUENTO ${pricing.discountName} [${pricing.discountCode}]`;
  if (pricing.pricingMode === 'two_for_one') {
    return [
      { product: `${product}${suffix} · PROMOCIÓN 2X1 (CON CARGO)`, zone: pricing.localityName,
        quantity: pricing.chargedUnits, unitPrice: moneyFromCents(pricing.netAmount) / pricing.chargedUnits },
      ...(pricing.bonusUnits ? [{ product: `${product}${suffix} · PROMOCIÓN 2X1 (BONIFICADO)`,
        zone: pricing.localityName, quantity: pricing.bonusUnits, unitPrice: 0 }] : [])
    ];
  }
  const baseUnitCents = Math.floor(pricing.netAmount / data.pricing.seatCount);
  const higherPriceUnits = pricing.netAmount % data.pricing.seatCount;
  return [
    ...(higherPriceUnits ? [{ product: `${product}${suffix}`, zone: pricing.localityName,
      quantity: higherPriceUnits, unitPrice: moneyFromCents(baseUnitCents + 1) }] : []),
    ...(data.pricing.seatCount - higherPriceUnits ? [{ product: `${product}${suffix}`, zone: pricing.localityName,
      quantity: data.pricing.seatCount - higherPriceUnits, unitPrice: moneyFromCents(baseUnitCents) }] : [])
  ];
}

function paymentRow(row) {
  return {
    id: row.id,
    saleId: row.sale_id,
    amount: Number(row.amount),
    method: row.method,
    paidAt: row.paid_at,
    reference: row.reference,
    createdAt: row.created_at
  };
}

const CONTACT_SORT = Object.freeze({
  updatedAt: 'c.updated_at',
  name: 'c.last_name',
  lastContact: 'c.last_human_contact_at',
  nextFollowUp: 'c.next_follow_up_at',
  status: 'c.subscriber_status'
});

const CONTACT_DATE_FIELD = Object.freeze({
  updatedAt: 'c.updated_at',
  lastContact: 'c.last_human_contact_at',
  nextFollowUp: 'c.next_follow_up_at'
});

const TASK_SORT = Object.freeze({
  dueAt: 't.due_at',
  updatedAt: 't.updated_at',
  priority: 't.priority'
});

const SELECTED_MEMBERSHIP_COLUMNS = `
  sm.membership_id,sm.membership_status,sm.membership_section,
  sm.membership_seat_count,sm.membership_seats,sm.membership_row_version,
  sm.membership_price_book_version,sm.membership_currency,
  sm.membership_locality_code,sm.membership_locality_name,
  sm.membership_discount_code,sm.membership_discount_name,sm.membership_pricing_mode,
  sm.membership_list_unit_price,sm.membership_commercial_value,sm.membership_net_amount,
  sm.membership_discount_amount,sm.membership_effective_unit_price,
  sm.membership_charged_units,sm.membership_bonus_units`;

const SELECTED_MEMBERSHIP_JOIN = `
  LEFT JOIN LATERAL (
    SELECT
      m.id AS membership_id,
      m.membership_status,
      m.section AS membership_section,
      m.seat_count AS membership_seat_count,
      COALESCE(
        jsonb_agg(u.seat_identifier ORDER BY u.unit_number)
          FILTER (WHERE u.id IS NOT NULL AND NULLIF(btrim(u.seat_identifier),'') IS NOT NULL),
        '[]'::jsonb
      ) AS membership_seats,
      m.row_version AS membership_row_version
      ,m.price_book_version AS membership_price_book_version
      ,m.currency AS membership_currency
      ,m.locality_code AS membership_locality_code
      ,m.locality_name AS membership_locality_name
      ,m.discount_code AS membership_discount_code
      ,m.discount_name AS membership_discount_name
      ,m.pricing_mode AS membership_pricing_mode
      ,m.list_unit_price AS membership_list_unit_price
      ,m.commercial_value AS membership_commercial_value
      ,m.net_amount AS membership_net_amount
      ,m.discount_amount AS membership_discount_amount
      ,m.effective_unit_price AS membership_effective_unit_price
      ,m.charged_units AS membership_charged_units
      ,m.bonus_units AS membership_bonus_units
    FROM memberships m
    LEFT JOIN membership_units u
      ON u.membership_id=m.id AND u.deleted_at IS NULL
    WHERE m.contact_id=c.id
      AND m.season_code='LMP-2026-27'
      AND m.deleted_at IS NULL
    GROUP BY m.id
    ORDER BY CASE m.membership_status
      WHEN 'active' THEN 1 WHEN 'renewing' THEN 2
      WHEN 'expired' THEN 3 ELSE 4 END,
      m.created_at DESC,m.id
    LIMIT 1
  ) sm ON true`;

const AUDIT_PRICING_FIELDS = new Set([
  'localityCode', 'discountCode', 'priceBookVersion', 'commercialValue', 'netAmount',
  'discountAmount', 'chargedUnits', 'bonusUnits'
]);

function auditProjection(entity) {
  if (!entity) return null;
  return Object.fromEntries([
    'id', 'subscriberStatus', 'commercialStage', 'executiveId', 'consentStatus',
    'status', 'assignedTo', 'dueAt', 'rowVersion', 'seasonCode', 'membershipStatus',
    'section', 'seatCount', 'localityCode', 'discountCode', 'priceBookVersion',
    'commercialValue', 'netAmount', 'discountAmount', 'chargedUnits', 'bonusUnits', 'totalAmount',
    'paidAmount', 'role', 'active'
  ].filter((key) => entity[key] !== undefined
    && (!AUDIT_PRICING_FIELDS.has(key) || entity[key] !== null))
    .map((key) => [key, entity[key]]));
}

function canonicalSeatIdentifier(value) {
  return String(value ?? '').trim().replace(/\s+/gu, ' ').toLocaleLowerCase('es-MX');
}

function canonicalIdentityPhone(value) {
  if (value == null) return null;
  let digits = String(value).replace(/\D+/gu, '');
  if (digits.length === 12 && digits.startsWith('52')) digits = digits.slice(2);
  if (digits.length === 13 && digits.startsWith('521')) digits = digits.slice(3);
  return digits.length === 10 ? digits : null;
}

export class PgCrmRepository {
  constructor(pool, { exportRowLimit = 50_000 } = {}) {
    this.pool = pool;
    this.exportRowLimit = exportRowLimit;
  }

  async getSubscriptionPricingCatalog({ client = this.pool } = {}) {
    const priceBookResult = await client.query(
      `SELECT version,season_code,display_name,currency
       FROM membership_price_books
       WHERE season_code=$1 AND active=true`,
      [MEMBERSHIP_PRICING_SEASON]
    );
    const priceBook = priceBookResult.rows[0];
    if (!priceBook) throw notFound('Catalogo de precios');
    const [localitiesResult, discountsResult] = await Promise.all([
      client.query(
        `SELECT code,display_name,section,list_unit_price,july25_unit_price,
                july25_mode,promotion_label,sort_order
         FROM membership_locality_prices WHERE price_book_version=$1 ORDER BY sort_order`,
        [priceBook.version]
      ),
      client.query(
        `SELECT code,display_name,mode,rate_basis_points,sort_order
         FROM membership_discount_campaigns
         WHERE price_book_version=$1 AND selectable=true ORDER BY sort_order`,
        [priceBook.version]
      )
    ]);
    return {
      priceBookVersion: priceBook.version,
      seasonCode: priceBook.season_code,
      displayName: priceBook.display_name,
      currency: priceBook.currency,
      localities: localitiesResult.rows.map((row) => ({
        code: row.code,
        displayName: row.display_name,
        section: row.section,
        listUnitPrice: moneyFromCents(row.list_unit_price),
        july25UnitPrice: moneyFromCents(row.july25_unit_price),
        july25Mode: row.july25_mode,
        promotionLabel: row.promotion_label ?? null,
        sortOrder: Number(row.sort_order)
      })),
      discounts: discountsResult.rows.map((row) => ({
        code: row.code,
        displayName: row.display_name,
        mode: row.mode,
        rateBasisPoints: row.rate_basis_points == null ? null : Number(row.rate_basis_points),
        sortOrder: Number(row.sort_order)
      }))
    };
  }

  async resolveSubscriptionPricing(client, {
    seasonCode = MEMBERSHIP_PRICING_SEASON,
    section,
    localityCode,
    discountCode,
    seatCount
  }) {
    const result = await client.query(
      `SELECT pb.version,pb.currency,
              lp.code AS locality_code,lp.display_name AS locality_name,lp.section,
              lp.list_unit_price,lp.july25_unit_price,lp.july25_mode,
              dc.code AS discount_code,dc.display_name AS discount_name,
              dc.mode AS discount_mode,dc.rate_basis_points
       FROM membership_price_books pb
       JOIN membership_locality_prices lp ON lp.price_book_version=pb.version AND lp.code=$2
       JOIN membership_discount_campaigns dc ON dc.price_book_version=pb.version AND dc.code=$3
       WHERE pb.season_code=$1 AND pb.active=true AND dc.selectable=true`,
      [seasonCode, localityCode, discountCode]
    );
    const row = result.rows[0];
    if (!row) throw badRequest('La localidad o el descuento seleccionado no existe en el catalogo.');
    if (section !== undefined && section !== row.section) {
      throw badRequest('La localidad seleccionada no pertenece a la seccion indicada.');
    }
    return calculateMembershipPrice({
      priceBook: { version: row.version, currency: row.currency },
      locality: {
        code: row.locality_code,
        displayName: row.locality_name,
        section: row.section,
        listUnitPrice: Number(row.list_unit_price),
        july25UnitPrice: Number(row.july25_unit_price),
        july25Mode: row.july25_mode
      },
      discount: {
        code: row.discount_code,
        displayName: row.discount_name,
        mode: row.discount_mode,
        rateBasisPoints: row.rate_basis_points == null ? null : Number(row.rate_basis_points)
      },
      seatCount
    });
  }

  async quoteSubscription(input) {
    return publicPricing(await this.resolveSubscriptionPricing(this.pool, input));
  }

  async findLocalAdminForLogin(email) {
    const result = await this.pool.query(
      `SELECT u.*,
         c.password_hash,
         COALESCE(jsonb_agg(jsonb_build_object('permission', g.permission, 'allowed', g.allowed))
           FILTER (WHERE g.permission IS NOT NULL), '[]'::jsonb) AS permission_grants
       FROM app_users u
       JOIN local_credentials c ON c.user_id = u.id
       LEFT JOIN user_permission_grants g ON g.user_id = u.id
       WHERE lower(u.email) = lower($1) AND u.role = 'admin'
         AND u.active = true AND u.deleted_at IS NULL
       GROUP BY u.id,c.user_id`,
      [email]
    );
    if (!result.rows[0]) return null;
    return {
      ...userRow(result.rows[0]),
      passwordHash: result.rows[0].password_hash
    };
  }

  async consumeLoginIpAttempt(keyHash, { windowMs, maxAttempts, blockMs }) {
    return withTransaction(this.pool, async (client) => {
      await client.query(
        `DELETE FROM auth_login_throttles
         WHERE updated_at < now() - interval '2 days'
           AND (blocked_until IS NULL OR blocked_until < now())`
      );
      const result = await client.query(
        `INSERT INTO auth_login_throttles
           (key_hash,window_started_at,attempts,blocked_until,updated_at)
         VALUES ($1,now(),1,NULL,now())
         ON CONFLICT (key_hash) DO UPDATE SET
           attempts = CASE
             WHEN auth_login_throttles.blocked_until IS NOT NULL
               AND auth_login_throttles.blocked_until > now()
               THEN auth_login_throttles.attempts
             WHEN auth_login_throttles.window_started_at <= now() - ($2::bigint * interval '1 millisecond')
               THEN 1
             ELSE auth_login_throttles.attempts + 1
           END,
           window_started_at = CASE
             WHEN auth_login_throttles.window_started_at <= now() - ($2::bigint * interval '1 millisecond')
               THEN now()
             ELSE auth_login_throttles.window_started_at
           END,
           blocked_until = CASE
             WHEN auth_login_throttles.blocked_until IS NOT NULL
               AND auth_login_throttles.blocked_until > now()
               THEN auth_login_throttles.blocked_until
             WHEN (CASE
               WHEN auth_login_throttles.window_started_at <= now() - ($2::bigint * interval '1 millisecond')
                 THEN 1
               ELSE auth_login_throttles.attempts + 1
             END) > $3
               THEN now() + ($4::bigint * interval '1 millisecond')
             ELSE NULL
           END,
           updated_at = now()
         RETURNING attempts,blocked_until`,
        [keyHash, windowMs, maxAttempts, blockMs]
      );
      const row = result.rows[0];
      return {
        allowed: !(row.blocked_until && new Date(row.blocked_until).getTime() > Date.now()),
        blockedUntil: row.blocked_until
      };
    });
  }

  async clearLoginIpThrottle(keyHash) {
    await this.pool.query('DELETE FROM auth_login_throttles WHERE key_hash=$1', [keyHash]);
  }

  async recordLocalLoginSuccess(userId) {
    await this.pool.query('UPDATE app_users SET last_login_at=now() WHERE id=$1', [userId]);
  }

  async createAuthSession(data) {
    return withTransaction(this.pool, async (client) => {
      await client.query(
        `DELETE FROM auth_sessions
         WHERE (revoked_at IS NOT NULL AND revoked_at < now() - interval '30 days')
            OR (expires_at < now() - interval '30 days')`
      );
      await client.query(
        `UPDATE auth_sessions SET revoked_at=COALESCE(revoked_at,now())
         WHERE user_id=$1 AND revoked_at IS NULL`,
        [data.userId]
      );
      const result = await client.query(
        `INSERT INTO auth_sessions
           (user_id,token_digest,csrf_digest,idle_expires_at,expires_at,created_ip_hash,user_agent)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         RETURNING id,idle_expires_at,expires_at`,
        [data.userId, data.tokenDigest, data.csrfDigest, data.idleExpiresAt, data.expiresAt,
          data.ipHash, data.userAgent]
      );
      return {
        id: result.rows[0].id,
        idleExpiresAt: result.rows[0].idle_expires_at,
        expiresAt: result.rows[0].expires_at
      };
    });
  }

  async findActiveAuthSession(tokenDigest, idleTtlMs) {
    return withTransaction(this.pool, async (client) => {
      await client.query(
        `UPDATE auth_sessions SET revoked_at=COALESCE(revoked_at,now())
         WHERE token_digest=$1 AND revoked_at IS NULL
           AND (expires_at <= now() OR idle_expires_at <= now())`,
        [tokenDigest]
      );
      const result = await client.query(
        `UPDATE auth_sessions s SET
           last_seen_at=now(),
           idle_expires_at=LEAST(s.expires_at,now() + ($2::bigint * interval '1 millisecond'))
         FROM app_users u, local_credentials c
         WHERE s.token_digest=$1 AND s.user_id=u.id AND c.user_id=u.id
           AND s.revoked_at IS NULL AND s.expires_at > now() AND s.idle_expires_at > now()
           AND u.active=true AND u.deleted_at IS NULL AND u.role='admin'
         RETURNING s.id AS session_id,s.csrf_digest,s.created_at AS session_created_at,s.last_seen_at,
           s.idle_expires_at,s.expires_at,u.*,
           COALESCE((SELECT jsonb_agg(jsonb_build_object('permission',g.permission,'allowed',g.allowed))
             FROM user_permission_grants g WHERE g.user_id=u.id),'[]'::jsonb) AS permission_grants`,
        [tokenDigest, idleTtlMs]
      );
      if (!result.rows[0]) return null;
      const row = result.rows[0];
      return {
        id: row.session_id,
        csrfDigest: row.csrf_digest,
        createdAt: row.session_created_at,
        lastSeenAt: row.last_seen_at,
        idleExpiresAt: row.idle_expires_at,
        expiresAt: row.expires_at,
        actor: userRow(row)
      };
    });
  }

  async rotateAuthSessionCsrf(sessionId, csrfDigest) {
    const result = await this.pool.query(
      `UPDATE auth_sessions SET csrf_digest=$2
       WHERE id=$1 AND revoked_at IS NULL AND expires_at>now() AND idle_expires_at>now()
       RETURNING id`,
      [sessionId, csrfDigest]
    );
    return Boolean(result.rows[0]);
  }

  async revokeAuthSession(tokenDigest) {
    await this.pool.query(
      'UPDATE auth_sessions SET revoked_at=COALESCE(revoked_at,now()) WHERE token_digest=$1',
      [tokenDigest]
    );
  }

  async recordAuthEvent(userId, context, action) {
    await this.pool.query(
      `INSERT INTO audit_events
         (actor_id,action,entity_type,entity_id,request_id,metadata,ip_hash,user_agent)
       VALUES ($1,$2,'auth',$3,$4,'{}'::jsonb,$5,$6)`,
      [userId, action, String(userId), context?.requestId, context?.ipHash ?? null,
        context?.userAgent?.slice(0, 500) ?? null]
    );
  }

  async ready() {
    await this.pool.query('SELECT 1');
    return true;
  }

  async assertActiveUser(client, id, roles) {
    const result = await client.query(
      `SELECT id,role FROM app_users WHERE id=$1 AND active=true AND deleted_at IS NULL AND role = ANY($2::text[])`,
      [id, roles]
    );
    if (!result.rows[0]) throw conflict('El usuario asignado no está activo o no tiene un rol válido.');
    return result.rows[0];
  }

  async audit(client, context, event) {
    await client.query(
      `INSERT INTO audit_events
        (actor_id, action, entity_type, entity_id, request_id, before_state, after_state, metadata, ip_hash, user_agent)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [
        context.actorId,
        event.action,
        event.entityType,
        event.entityId ? String(event.entityId) : null,
        context.requestId,
        event.before ? auditProjection(event.before) : null,
        event.after ? auditProjection(event.after) : null,
        event.metadata ?? {},
        context.ipHash ?? null,
        context.userAgent?.slice(0, 500) ?? null
      ]
    );
  }

  async dashboardSummary({ actor, filters }) {
    const params = [];
    const where = ['c.deleted_at IS NULL'];
    if (actor.role === 'executive') {
      params.push(actor.id);
      where.push(`c.executive_id = $${params.length}`);
    }
    if (filters.executiveId && actor.role !== 'executive') {
      params.push(filters.executiveId);
      where.push(`c.executive_id = $${params.length}`);
    }
    if (filters.subscriberStatus) {
      params.push(filters.subscriberStatus);
      where.push(`c.subscriber_status = $${params.length}`);
    }
    if (filters.commercialStage) {
      params.push(filters.commercialStage);
      where.push(`c.commercial_stage = $${params.length}`);
    }
    if (filters.lastChannel) {
      params.push(filters.lastChannel);
      where.push(`s.last_human_contact_channel = $${params.length}`);
    }
    const contactWhere = where.join(' AND ');
    const fromParameter = params.length + 1;
    const toParameter = params.length + 2;
    const seasonParameter = params.length + 3;

    const result = await this.pool.query(
      `WITH scoped_contacts AS (
         SELECT c.* FROM contacts c
         LEFT JOIN contact_operational_summary s ON s.id = c.id
         WHERE ${contactWhere}
       ), contact_metrics AS (
         SELECT
           count(*)::integer AS total_contacts,
           count(*) FILTER (WHERE subscriber_status IN ('current_subscriber','new_subscriber') AND is_commitment_only=false)::integer AS current_subscribers,
           count(*) FILTER (WHERE subscriber_status = 'renewing')::integer AS renewing,
           count(*) FILTER (WHERE subscriber_status = 'prospect')::integer AS prospects,
           count(*) FILTER (WHERE subscriber_status = 'new_subscriber' AND EXISTS (
             SELECT 1 FROM memberships nm
             WHERE nm.contact_id=scoped_contacts.id AND nm.deleted_at IS NULL
               AND nm.season_code=COALESCE($${seasonParameter}::text,'LMP-2026-27')
               AND ($${fromParameter}::timestamptz IS NULL OR COALESCE(nm.renewal_date,nm.start_date,nm.created_at) >= $${fromParameter})
               AND ($${toParameter}::timestamptz IS NULL OR COALESCE(nm.renewal_date,nm.start_date,nm.created_at) <= $${toParameter})
           ))::integer AS new_subscribers,
           count(*) FILTER (WHERE subscriber_status = 'current_subscriber' AND is_commitment_only=false AND (
             ($${fromParameter}::timestamptz IS NULL AND $${toParameter}::timestamptz IS NULL) OR EXISTS (
             SELECT 1 FROM memberships rm
             WHERE rm.contact_id=scoped_contacts.id AND rm.deleted_at IS NULL
               AND rm.membership_status='active'
               AND rm.season_code=COALESCE($${seasonParameter}::text,'LMP-2026-27')
               AND NOT (lower(COALESCE(rm.product,'')) LIKE '%compromiso%' OR lower(COALESCE(rm.zone,''))='zona suites')
               AND ($${fromParameter}::timestamptz IS NULL OR COALESCE(rm.renewal_date,rm.start_date,rm.created_at) >= $${fromParameter})
               AND ($${toParameter}::timestamptz IS NULL OR COALESCE(rm.renewal_date,rm.start_date,rm.created_at) <= $${toParameter})
           )))::integer AS renewed_subscribers,
           count(*) FILTER (WHERE commercial_stage IN ('unassigned','to_contact'))::integer AS not_contacted,
           count(*) FILTER (WHERE executive_id IS NULL)::integer AS unassigned,
           count(*) FILTER (WHERE next_follow_up_at < now())::integer AS overdue_follow_ups
         FROM scoped_contacts
       ), membership_metrics AS (
         SELECT
           COALESCE(sum(m.seat_count) FILTER (WHERE m.membership_status='active'),0)::integer AS active_seats,
           COALESCE(sum(m.seat_count) FILTER (
             WHERE m.membership_status='active' AND c.subscriber_status='new_subscriber'
               AND ($${fromParameter}::timestamptz IS NULL OR COALESCE(m.renewal_date,m.start_date,m.created_at) >= $${fromParameter})
               AND ($${toParameter}::timestamptz IS NULL OR COALESCE(m.renewal_date,m.start_date,m.created_at) <= $${toParameter})
           ),0)::integer AS new_seats,
           COALESCE(sum(m.seat_count) FILTER (
             WHERE m.membership_status='active' AND c.subscriber_status='current_subscriber'
               AND NOT (lower(COALESCE(m.product,'')) LIKE '%compromiso%' OR lower(COALESCE(m.zone,''))='zona suites')
               AND ($${fromParameter}::timestamptz IS NULL OR COALESCE(m.renewal_date,m.start_date,m.created_at) >= $${fromParameter})
               AND ($${toParameter}::timestamptz IS NULL OR COALESCE(m.renewal_date,m.start_date,m.created_at) <= $${toParameter})
           ),0)::integer AS renewed_seats,
           COALESCE(sum(m.seat_count) FILTER (WHERE m.membership_status='active' AND (lower(COALESCE(m.product,'')) LIKE '%compromiso%' OR lower(COALESCE(m.zone,''))='zona suites')),0)::integer AS segment_commitments,
           COALESCE(sum(m.seat_count) FILTER (WHERE m.membership_status='active' AND NOT (lower(COALESCE(m.product,'')) LIKE '%compromiso%' OR lower(COALESCE(m.zone,''))='zona suites') AND m.section='VIP'),0)::integer AS segment_vip,
           COALESCE(sum(m.seat_count) FILTER (WHERE m.membership_status='active' AND NOT (lower(COALESCE(m.product,'')) LIKE '%compromiso%' OR lower(COALESCE(m.zone,''))='zona suites') AND m.section='Preferente'),0)::integer AS segment_preferente,
           COALESCE(sum(m.seat_count) FILTER (WHERE m.membership_status='active' AND NOT (lower(COALESCE(m.product,'')) LIKE '%compromiso%' OR lower(COALESCE(m.zone,''))='zona suites') AND (m.section='General' OR m.section IS NULL)),0)::integer AS segment_general,
           count(*) FILTER (
             WHERE m.membership_status IN ('active','renewing')
               AND m.price_book_version IS NOT NULL
               AND m.season_code=COALESCE($${seasonParameter}::text,'LMP-2026-27')
           )::integer AS priced_memberships,
           COALESCE(sum(m.seat_count) FILTER (
             WHERE m.membership_status IN ('active','renewing')
               AND m.price_book_version IS NOT NULL
               AND m.season_code=COALESCE($${seasonParameter}::text,'LMP-2026-27')
           ),0)::integer AS priced_seats,
           COALESCE(sum(m.commercial_value) FILTER (
             WHERE m.membership_status IN ('active','renewing')
               AND m.price_book_version IS NOT NULL
               AND m.season_code=COALESCE($${seasonParameter}::text,'LMP-2026-27')
           ),0)::bigint AS membership_commercial_value,
           COALESCE(sum(m.net_amount) FILTER (
             WHERE m.membership_status IN ('active','renewing')
               AND m.price_book_version IS NOT NULL
               AND m.season_code=COALESCE($${seasonParameter}::text,'LMP-2026-27')
           ),0)::bigint AS membership_net_amount,
           COALESCE(sum(m.discount_amount) FILTER (
             WHERE m.membership_status IN ('active','renewing')
               AND m.price_book_version IS NOT NULL
               AND m.season_code=COALESCE($${seasonParameter}::text,'LMP-2026-27')
           ),0)::bigint AS membership_discount_amount
         FROM memberships m JOIN scoped_contacts c ON c.id = m.contact_id
         WHERE m.deleted_at IS NULL
           AND ($${seasonParameter}::text IS NULL OR m.season_code = $${seasonParameter})
       ), interaction_metrics AS (
         SELECT count(*)::integer AS human_interactions
         FROM interactions i JOIN scoped_contacts c ON c.id = i.contact_id
         WHERE i.voided_at IS NULL AND i.is_human_contact = true
           AND ($${fromParameter}::timestamptz IS NULL OR i.occurred_at >= $${fromParameter})
           AND ($${toParameter}::timestamptz IS NULL OR i.occurred_at <= $${toParameter})
       ), campaign_metrics AS (
         SELECT count(*)::integer AS campaign_messages
         FROM campaign_messages cm JOIN scoped_contacts c ON c.id = cm.contact_id
         WHERE ($${fromParameter}::timestamptz IS NULL OR cm.sent_at >= $${fromParameter})
           AND ($${toParameter}::timestamptz IS NULL OR cm.sent_at <= $${toParameter})
       ), sales_metrics AS (
         SELECT
           count(*) FILTER (WHERE s.effective_status IN ('confirmed','reserved'))::integer AS confirmed_sales,
           COALESCE(sum(s.effective_total_amount) FILTER (WHERE s.effective_status IN ('confirmed','reserved')), 0)::numeric AS sales_amount,
           COALESCE(sum(COALESCE(p.paid_amount,0)) FILTER (WHERE s.effective_status IN ('confirmed','reserved')), 0)::numeric AS collected_amount,
           count(DISTINCT s.effective_contact_id) FILTER (
             WHERE s.effective_status IN ('confirmed','reserved') AND s.effective_sale_type='new'
           )::integer AS sold_new_subscribers,
           count(DISTINCT s.effective_contact_id) FILTER (
             WHERE s.effective_status IN ('confirmed','reserved') AND s.effective_sale_type='renewal'
           )::integer AS sold_renewed_subscribers,
           COALESCE(sum(COALESCE(i.seat_count,0)) FILTER (
             WHERE s.effective_status IN ('confirmed','reserved') AND s.effective_sale_type='new'
           ),0)::integer AS sold_new_seats,
           COALESCE(sum(COALESCE(i.seat_count,0)) FILTER (
             WHERE s.effective_status IN ('confirmed','reserved') AND s.effective_sale_type='renewal'
           ),0)::integer AS sold_renewed_seats
         FROM effective_sales s JOIN scoped_contacts c ON c.id = s.effective_contact_id
         LEFT JOIN LATERAL (
           SELECT sum(p.amount + COALESCE(a.amount,0)) AS paid_amount
           FROM payments p
           LEFT JOIN LATERAL (
             SELECT sum(amount) AS amount FROM payment_adjustments WHERE payment_id=p.id
           ) a ON true
           WHERE p.sale_id=s.id AND p.voided_at IS NULL
         ) p ON true
         LEFT JOIN LATERAL (
           SELECT sum((item->>'quantity')::integer)::integer AS seat_count
           FROM jsonb_array_elements(s.effective_items) item
         ) i ON true
         WHERE s.deleted_at IS NULL
           AND ($${fromParameter}::timestamptz IS NULL OR s.effective_sold_at >= $${fromParameter})
           AND ($${toParameter}::timestamptz IS NULL OR s.effective_sold_at <= $${toParameter})
           AND ($${seasonParameter}::text IS NULL OR s.season_code = $${seasonParameter})
       )
       SELECT * FROM contact_metrics, membership_metrics, interaction_metrics, campaign_metrics, sales_metrics`,
      [...params, filters.from ?? null, filters.to ?? null, filters.season ?? null]
    );
    const row = result.rows[0];
    return {
      totalContacts: Number(row.total_contacts),
      currentSubscribers: Number(row.current_subscribers),
      activeSeats: Number(row.active_seats),
      pricedMemberships: Number(row.priced_memberships ?? 0),
      pricedSeats: Number(row.priced_seats ?? 0),
      membershipCommercialValue: moneyFromCents(row.membership_commercial_value ?? 0),
      membershipNetAmount: moneyFromCents(row.membership_net_amount ?? 0),
      membershipDiscountAmount: moneyFromCents(row.membership_discount_amount ?? 0),
      renewing: Number(row.renewing),
      newSubscribers: Number(row.sold_new_subscribers ?? row.new_subscribers ?? 0),
      newSeats: Number(row.sold_new_seats ?? row.new_seats ?? 0),
      renewedSubscribers: Number(row.sold_renewed_subscribers ?? row.renewed_subscribers ?? 0),
      renewedSeats: Number(row.sold_renewed_seats ?? row.renewed_seats ?? 0),
      prospects: Number(row.prospects),
      membershipSegments: {
        Compromisos: Number(row.segment_commitments ?? 0),
        VIP: Number(row.segment_vip ?? 0),
        Preferente: Number(row.segment_preferente ?? 0),
        General: Number(row.segment_general ?? 0)
      },
      notContacted: Number(row.not_contacted),
      unassigned: Number(row.unassigned),
      overdueFollowUps: Number(row.overdue_follow_ups),
      humanInteractions: Number(row.human_interactions),
      campaignMessages: Number(row.campaign_messages),
      confirmedSales: Number(row.confirmed_sales),
      salesAmount: Number(row.sales_amount),
      collectedAmount: Number(row.collected_amount),
      balanceAmount: Number(row.sales_amount) - Number(row.collected_amount)
    };
  }

  buildContactFilter(filters, actor) {
    const params = [];
    const where = [];
    if (filters.deletedOnly) where.push('c.deleted_at IS NOT NULL');
    else if (!filters.includeDeleted) where.push('c.deleted_at IS NULL');
    if (actor.role === 'executive') {
      params.push(actor.id);
      where.push(`c.executive_id = $${params.length}`);
    } else if (filters.executiveId) {
      params.push(filters.executiveId);
      where.push(`c.executive_id = $${params.length}`);
    }
    if (filters.segment === 'prospect') {
      where.push("c.subscriber_status = 'prospect'");
    } else if (filters.segment === 'portfolio') {
      where.push("c.subscriber_status <> 'prospect'");
    }
    if (filters.assignment === 'assigned') {
      where.push('c.executive_id IS NOT NULL');
    } else if (filters.assignment === 'unassigned') {
      where.push('c.executive_id IS NULL');
    }
    if (filters.subscriberStatus) {
      params.push(filters.subscriberStatus);
      where.push(`c.subscriber_status = $${params.length}`);
    }
    if (filters.commercialStage) {
      params.push(filters.commercialStage);
      where.push(`c.commercial_stage = $${params.length}`);
    }
    if (filters.lastChannel) {
      params.push(filters.lastChannel);
      where.push(`s.last_human_contact_channel = $${params.length}`);
    }
    if (filters.search) {
      params.push(`%${filters.search}%`);
      where.push(`(concat_ws(' ',c.first_name,c.last_name) ILIKE $${params.length}
        OR c.first_name ILIKE $${params.length} OR c.last_name ILIKE $${params.length}
        OR c.email ILIKE $${params.length} OR c.phone ILIKE $${params.length}
        OR c.external_ref ILIKE $${params.length} OR c.id::text ILIKE $${params.length}
        OR c.summary_notes ILIKE $${params.length})`);
    }
    const dateField = CONTACT_DATE_FIELD[filters.dateField] ?? CONTACT_DATE_FIELD.updatedAt;
    if (filters.from) {
      params.push(filters.from);
      where.push(`${dateField} >= $${params.length}`);
    }
    if (filters.to) {
      params.push(filters.to);
      where.push(`${dateField} <= $${params.length}`);
    }
    return { params, where: where.length ? where.join(' AND ') : 'true' };
  }

  async listContacts({ actor, filters }) {
    const { params, where } = this.buildContactFilter(filters, actor);
    const offset = (filters.page - 1) * filters.pageSize;
    params.push(filters.pageSize, offset);
    const sort = CONTACT_SORT[filters.sort] ?? CONTACT_SORT.updatedAt;
    const order = filters.order === 'asc' ? 'ASC' : 'DESC';
    const result = await this.pool.query(
      `SELECT c.*, u.display_name AS executive_name, s.seat_count, s.managed_seat_count, s.seasons_count,
               s.next_task_at, s.overdue_tasks, s.last_human_contact_channel,
               ${SELECTED_MEMBERSHIP_COLUMNS},
               count(*) OVER()::integer AS total_count
       FROM contacts c
       LEFT JOIN app_users u ON u.id = c.executive_id
       LEFT JOIN contact_operational_summary s ON s.id = c.id
       ${SELECTED_MEMBERSHIP_JOIN}
       WHERE ${where}
       ORDER BY ${sort} ${order} NULLS LAST, c.id
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    return {
      items: result.rows.map(contactRow),
      total: Number(result.rows[0]?.total_count ?? 0)
    };
  }

  async getContact(id, actor, { includeDeleted = false, client = this.pool } = {}) {
    const params = [id];
    const where = ['c.id = $1'];
    if (!includeDeleted) where.push('c.deleted_at IS NULL');
    if (actor.role === 'executive') {
      params.push(actor.id);
      where.push(`c.executive_id = $${params.length}`);
    }
    const result = await client.query(
      `SELECT c.*, u.display_name AS executive_name, s.seat_count, s.managed_seat_count, s.seasons_count,
               s.next_task_at, s.overdue_tasks, s.last_human_contact_channel,
               ${SELECTED_MEMBERSHIP_COLUMNS}
       FROM contacts c
       LEFT JOIN app_users u ON u.id = c.executive_id
       LEFT JOIN contact_operational_summary s ON s.id = c.id
       ${SELECTED_MEMBERSHIP_JOIN}
       WHERE ${where.join(' AND ')}`,
      params
    );
    return contactRow(result.rows[0]);
  }

  async getMembership(id, { client = this.pool } = {}) {
    if (!id) return null;
    const result = await client.query(
      `SELECT m.*,
        COALESCE(jsonb_agg(jsonb_build_object(
          'id',u.id,'unitNumber',u.unit_number,'seatIdentifier',u.seat_identifier,
          'zone',u.zone,'product',u.product,'jerseySize',u.jersey_size
        ) ORDER BY u.unit_number) FILTER (WHERE u.id IS NOT NULL), '[]'::jsonb) AS units
       FROM memberships m
       LEFT JOIN membership_units u ON u.membership_id=m.id AND u.deleted_at IS NULL
       WHERE m.id=$1 AND m.deleted_at IS NULL GROUP BY m.id`,
      [id]
    );
    return membershipRow(result.rows[0]);
  }

  async getInteraction(id, { client = this.pool } = {}) {
    const result = await client.query(
      `SELECT i.*,u.display_name AS actor_name,concat(c.first_name,' ',c.last_name) AS contact_name
       FROM interactions i JOIN app_users u ON u.id=i.actor_id JOIN contacts c ON c.id=i.contact_id
       WHERE i.id=$1 AND i.voided_at IS NULL`,
      [id]
    );
    return result.rows[0]
      ? { ...interactionRow(result.rows[0]), contactName: result.rows[0].contact_name }
      : null;
  }

  async hydrateManualRegistration(record, actor, client) {
    const contact = await this.getContact(record.contact_id, actor, { client });
    if (!contact) throw conflict('El resultado idempotente ya no está disponible como contacto activo.');
    return {
      contact,
      membership: await this.getMembership(record.membership_id, { client }),
      initialInteraction: await this.getInteraction(record.interaction_id, { client }),
      nextTask: record.task_id ? await this.getTask(record.task_id, actor, { client }) : null
    };
  }

  async lockContactIdentities(client, { email, phone }) {
    const normalizedEmail = typeof email === 'string' && email.trim()
      ? email.trim().toLowerCase()
      : null;
    const normalizedPhone = canonicalIdentityPhone(phone);
    const identityKeys = [
      normalizedEmail ? `email:${normalizedEmail}` : null,
      normalizedPhone ? `phone:${normalizedPhone}` : null
    ].filter(Boolean).sort();
    for (const identityKey of identityKeys) {
      await client.query(
        'SELECT pg_advisory_xact_lock(hashtextextended($1,0))',
        [`manual-registration-identity:${identityKey}`]
      );
    }
    return { email: normalizedEmail, phone: normalizedPhone };
  }

  async lockMembershipSeason(client, contactId, seasonCode) {
    await client.query(
      'SELECT pg_advisory_xact_lock(hashtextextended($1,0))',
      [`membership-season:${contactId}:${seasonCode}`]
    );
  }

  async lockMembershipSeats(client, seasonCode, section, units) {
    if (!section) return;
    const lockKeys = [...new Set(units.map((unit) => canonicalSeatIdentifier(unit.seatIdentifier)))]
      .filter(Boolean)
      .sort()
      .map((seat) => `membership-seat:${seasonCode}:${section}:${seat}`);
    for (const lockKey of lockKeys) {
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [lockKey]);
    }
  }

  async assertMembershipSeatsAvailable(client, {
    seasonCode, section, units, excludeMembershipId = null
  }) {
    if (!section) return;
    const requested = units.map((unit) => ({
      value: unit.seatIdentifier,
      canonical: canonicalSeatIdentifier(unit.seatIdentifier)
    })).filter((seat) => seat.canonical);
    if (!requested.length) return;
    const result = await client.query(
      `SELECT DISTINCT lower(regexp_replace(btrim(u.seat_identifier),'[[:space:]]+',' ','g')) AS seat
       FROM membership_units u
       JOIN memberships m ON m.id=u.membership_id
       WHERE m.season_code=$1 AND m.section=$2
         AND m.membership_status IN ('active','renewing')
         AND m.deleted_at IS NULL AND u.deleted_at IS NULL
         AND lower(regexp_replace(btrim(u.seat_identifier),'[[:space:]]+',' ','g')) = ANY($3::text[])
         AND ($4::uuid IS NULL OR m.id<>$4)`,
      [seasonCode, section, requested.map((seat) => seat.canonical), excludeMembershipId]
    );
    if (!result.rows.length) return;
    const conflicts = new Set(result.rows.map((row) => row.seat));
    throw conflict('Una o más butacas ya están asignadas en esta temporada y sección.', {
      seats: requested.filter((seat) => conflicts.has(seat.canonical)).map((seat) => seat.value)
    });
  }

  async assertContactIdentityAvailable(client, identity, { excludeContactId = null } = {}) {
    if (!identity.email && !identity.phone) return;
    const duplicates = await client.query(
      `SELECT c.id,c.deleted_at FROM contacts c
       CROSS JOIN LATERAL (
         SELECT regexp_replace(COALESCE(c.phone,''),'[^0-9]','','g') AS digits
       ) contact_phone
       WHERE (
         ($1::text IS NOT NULL AND lower(trim(c.email))=lower(trim($1)))
          OR ($2::text IS NOT NULL
            AND CASE
              WHEN contact_phone.digits ~ '^(52|521)[0-9]{10}$'
                THEN right(contact_phone.digits,10)
              ELSE contact_phone.digits
            END=$2)
          OR EXISTS (
            SELECT 1 FROM contact_aliases a
            CROSS JOIN LATERAL (
              SELECT regexp_replace(a.alias_value,'[^0-9]','','g') AS digits
            ) alias_phone
            WHERE a.contact_id=c.id AND (
              ($1::text IS NOT NULL AND a.alias_type='email'
                AND lower(trim(a.alias_value))=lower(trim($1)))
              OR ($2::text IS NOT NULL AND a.alias_type='phone'
                AND CASE
                  WHEN alias_phone.digits ~ '^(52|521)[0-9]{10}$'
                    THEN right(alias_phone.digits,10)
                  ELSE alias_phone.digits
                END=$2)
            )
          )
       ) AND ($3::uuid IS NULL OR c.id<>$3)
       ORDER BY c.id FOR UPDATE OF c`,
      [identity.email, identity.phone, excludeContactId]
    );
    if (duplicates.rowCount > 0) {
      throw duplicateContact(
        duplicates.rows.map((row) => ({ id: row.id, deleted: Boolean(row.deleted_at) }))
      );
    }
  }

  async createContact(data, actor, context) {
    return withTransaction(this.pool, async (client) => {
      if (data.executiveId) await this.assertActiveUser(client, data.executiveId, ['executive']);
      const identity = await this.lockContactIdentities(client, data);
      await this.assertContactIdentityAvailable(client, identity);
      const result = await client.query(
        `INSERT INTO contacts
          (first_name,last_name,email,phone,municipality,subscriber_status,commercial_stage,
           preferred_channel,executive_id,source,acquisition_source,declared_tenure_seasons,consent_status,consent_at,privacy_notice_version,
           summary_notes,created_by,updated_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$17)
         RETURNING *`,
        [data.firstName, data.lastName, data.email ?? null, data.phone ?? null,
          data.municipality ?? null, data.subscriberStatus, data.commercialStage,
          data.preferredChannel ?? null, data.executiveId ?? null, data.source ?? null,
          data.acquisitionSource ?? null, data.declaredTenureSeasons ?? null,
          data.consentStatus ?? 'unknown', data.consentAt ?? null,
          data.privacyNoticeVersion ?? null, data.summaryNotes ?? null, actor.id]
      );
      const created = contactRow(result.rows[0]);
      if (data.executiveId) {
        await client.query(
          `INSERT INTO contact_assignments (contact_id, executive_id, assigned_by, reason)
           VALUES ($1,$2,$3,'initial assignment')`,
          [created.id, data.executiveId, actor.id]
        );
        await this.audit(client, context, {
          action: 'contact.assigned', entityType: 'contact', entityId: created.id,
          metadata: { previousExecutiveId: null, executiveId: data.executiveId }
        });
      }
      await client.query(
        `INSERT INTO contact_consents
           (contact_id,status,captured_at,source,privacy_notice_version,recorded_by)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [created.id, data.consentStatus ?? 'unknown', data.consentAt ?? new Date(),
          data.source ?? 'crm', data.privacyNoticeVersion ?? null, actor.id]
      );
      await this.audit(client, context, {
        action: 'contact.created', entityType: 'contact', entityId: created.id, after: created
      });
      return this.getContact(created.id, actor, { client });
    });
  }

  async createManualRegistration(data, actor, context, { idempotencyKey, requestHash }) {
    return withTransaction(this.pool, async (client) => {
      await client.query(
        'SELECT pg_advisory_xact_lock(hashtextextended($1,0))',
        [`manual-registration:${idempotencyKey}`]
      );
      const prior = await client.query(
        `SELECT * FROM manual_registration_requests WHERE idempotency_key=$1`,
        [idempotencyKey]
      );
      if (prior.rows[0]) {
        if (prior.rows[0].request_hash !== requestHash || prior.rows[0].actor_id !== actor.id) {
          throw conflict('Idempotency-Key ya fue utilizada con una solicitud diferente.');
        }
        return {
          ...(await this.hydrateManualRegistration(prior.rows[0], actor, client)),
          replayed: true
        };
      }

      if (data.contact.executiveId) {
        await this.assertActiveUser(client, data.contact.executiveId, ['executive']);
      }

      const identity = await this.lockContactIdentities(client, data.contact);
      await this.assertContactIdentityAvailable(client, identity);
      let manualPricing = null;
      if (data.membership?.section) {
        await this.lockMembershipSeats(
          client, data.membership.seasonCode, data.membership.section, data.membership.units
        );
        await this.assertMembershipSeatsAvailable(client, {
          seasonCode: data.membership.seasonCode,
          section: data.membership.section,
          units: data.membership.units
        });
        manualPricing = await this.resolveSubscriptionPricing(client, data.membership);
      }

      const contactResult = await client.query(
        `INSERT INTO contacts
          (first_name,last_name,email,phone,municipality,subscriber_status,commercial_stage,
           preferred_channel,executive_id,source,acquisition_source,declared_tenure_seasons,
           consent_status,consent_at,privacy_notice_version,summary_notes,created_by,updated_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,
           CASE WHEN $13='unknown' THEN NULL ELSE now() END,$14,$15,$16,$16)
         RETURNING *`,
        [data.contact.firstName, data.contact.lastName, data.contact.email ?? null,
          data.contact.phone ?? null, data.contact.municipality ?? null,
          data.contact.subscriberStatus, data.contact.commercialStage,
          data.contact.preferredChannel ?? null, data.contact.executiveId ?? null,
          data.contact.source, data.contact.acquisitionSource,
          data.contact.declaredTenureSeasons ?? null, data.consent.status,
          data.consent.privacyNoticeVersion, data.initialObservation.notes, actor.id]
      );
      const contactId = contactResult.rows[0].id;

      if (data.contact.executiveId) {
        await client.query(
          `INSERT INTO contact_assignments (contact_id,executive_id,assigned_by,reason)
           VALUES ($1,$2,$3,'manual registration')`,
          [contactId, data.contact.executiveId, actor.id]
        );
      }

      await client.query(
        `INSERT INTO contact_consents
          (contact_id,status,purpose,captured_at,source,privacy_notice_version,recorded_by)
         VALUES ($1,$2,$3,now(),$4,$5,$6)`,
        [contactId, data.consent.status, data.consent.purpose, data.consent.source,
          data.consent.privacyNoticeVersion, actor.id]
      );

      let membershipId = null;
      if (data.membership) {
        const membershipResult = await client.query(
          `INSERT INTO memberships
            (contact_id,season_code,membership_status,seat_count,seat_identifier,zone,section,product,
             start_date,renewal_date,created_by,updated_by,
             price_book_version,currency,locality_code,locality_name,discount_code,discount_name,
             pricing_mode,list_unit_price,commercial_value,net_amount,discount_amount,
             effective_unit_price,charged_units,bonus_units)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$11,
                   $12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25) RETURNING *`,
          [contactId, data.membership.seasonCode, data.membership.membershipStatus,
            data.membership.seatCount, data.membership.seatIdentifier ?? null,
            data.membership.zone ?? null, data.membership.section ?? null,
            data.membership.product ?? null, data.membership.startDate ?? null,
            data.membership.renewalDate ?? null, actor.id,
            manualPricing?.priceBookVersion ?? null, manualPricing?.currency ?? null,
            manualPricing?.localityCode ?? null, manualPricing?.localityName ?? null,
            manualPricing?.discountCode ?? null, manualPricing?.discountName ?? null,
            manualPricing?.pricingMode ?? null, manualPricing?.listUnitPrice ?? null,
            manualPricing?.commercialValue ?? null, manualPricing?.netAmount ?? null,
            manualPricing?.discountAmount ?? null, manualPricing?.effectiveUnitPrice ?? null,
            manualPricing?.chargedUnits ?? null, manualPricing?.bonusUnits ?? null]
        );
        membershipId = membershipResult.rows[0].id;
        for (const unit of data.membership.units) {
          await client.query(
            `INSERT INTO membership_units
              (membership_id,unit_number,seat_identifier,zone,product,jersey_size,created_by,updated_by)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$7)`,
            [membershipId, unit.unitNumber, unit.seatIdentifier ?? null, unit.zone ?? null,
              unit.product ?? null, unit.jerseySize, actor.id]
          );
        }
      }

      const interactionResult = await client.query(
        `INSERT INTO interactions
          (contact_id,actor_id,occurred_at,channel,outcome,notes,is_human_contact)
         VALUES ($1,$2,now(),'other','manual_registration',$3,false) RETURNING *`,
        [contactId, actor.id, data.initialObservation.notes]
      );
      const interactionId = interactionResult.rows[0].id;

      let taskId = null;
      if (data.nextTask) {
        const assignee = await this.assertActiveUser(
          client, data.nextTask.assignedTo, ['executive', 'supervisor', 'admin']
        );
        if (assignee.role === 'executive' && assignee.id !== data.contact.executiveId) {
          throw conflict('La tarea de un Ejecutivo debe pertenecer a un contacto de su cartera actual.');
        }
        const taskResult = await client.query(
          `INSERT INTO tasks
            (contact_id,assigned_to,created_by,description,due_at,priority,status)
           VALUES ($1,$2,$3,$4,$5,$6,'pending') RETURNING *`,
          [contactId, data.nextTask.assignedTo, actor.id, data.nextTask.description,
            data.nextTask.dueAt, data.nextTask.priority ?? 'normal']
        );
        taskId = taskResult.rows[0].id;
        await this.recomputeNextFollowUp(client, contactId, actor.id);
      }

      await client.query(
        `INSERT INTO manual_registration_requests
          (idempotency_key,request_hash,actor_id,contact_id,membership_id,interaction_id,task_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [idempotencyKey, requestHash, actor.id, contactId, membershipId, interactionId, taskId]
      );

      const hydrated = await this.hydrateManualRegistration({
        contact_id: contactId,
        membership_id: membershipId,
        interaction_id: interactionId,
        task_id: taskId
      }, actor, client);
      await this.audit(client, context, {
        action: 'manual_registration.created',
        entityType: 'contact',
        entityId: contactId,
        metadata: {
          membershipId,
          interactionId,
          taskId,
          subscriberStatus: data.contact.subscriberStatus,
          commercialStage: data.contact.commercialStage,
          acquisitionSource: data.contact.acquisitionSource,
          seasonCode: data.membership?.seasonCode ?? null,
          section: data.membership?.section ?? null,
          seatCount: data.membership?.seatCount ?? 0,
          ...(manualPricing ? publicPricing(manualPricing) : {}),
          consentStatus: data.consent.status
        }
      });
      return { ...hydrated, replayed: false };
    });
  }

  async updateContact(id, data, actor, context, expectedVersion) {
    return withTransaction(this.pool, async (client) => {
      const before = await this.getContact(id, actor, { includeDeleted: false, client });
      if (!before) throw notFound('Contacto');
      const columns = {
        firstName: 'first_name', lastName: 'last_name', email: 'email', phone: 'phone',
        municipality: 'municipality', subscriberStatus: 'subscriber_status',
        commercialStage: 'commercial_stage', preferredChannel: 'preferred_channel',
        executiveId: 'executive_id', source: 'source', acquisitionSource: 'acquisition_source',
        consentStatus: 'consent_status',
        declaredTenureSeasons: 'declared_tenure_seasons',
        consentAt: 'consent_at', privacyNoticeVersion: 'privacy_notice_version',
        summaryNotes: 'summary_notes'
      };
      const entries = Object.entries(data).filter(([key]) => columns[key]);
      if (!entries.length) throw conflict('No hay campos editables para actualizar.');
      if (data.executiveId) await this.assertActiveUser(client, data.executiveId, ['executive']);
      if (data.email !== undefined || data.phone !== undefined) {
        const identity = await this.lockContactIdentities(client, {
          email: data.email === undefined ? before.email : data.email,
          phone: data.phone === undefined ? before.phone : data.phone
        });
        await this.assertContactIdentityAvailable(client, identity, { excludeContactId: id });
      }
      const values = entries.map(([, value]) => value);
      const sets = entries.map(([key], index) => `${columns[key]} = $${index + 1}`);
      values.push(actor.id, id, expectedVersion);
      const result = await client.query(
        `UPDATE contacts SET ${sets.join(', ')}, updated_by = $${entries.length + 1}
         WHERE id = $${entries.length + 2} AND row_version = $${entries.length + 3} AND deleted_at IS NULL
         RETURNING *`,
        values
      );
      if (!result.rows[0]) throw conflict('El contacto cambió desde que lo abriste. Actualiza la vista e inténtalo de nuevo.');
      const after = contactRow(result.rows[0]);

      if (data.executiveId !== undefined && data.executiveId !== before.executiveId) {
        await client.query('UPDATE contact_assignments SET ended_at = now() WHERE contact_id = $1 AND ended_at IS NULL', [id]);
        if (data.executiveId) {
          await client.query(
            `INSERT INTO contact_assignments (contact_id, executive_id, assigned_by, reason)
             VALUES ($1,$2,$3,'crm reassignment')`, [id, data.executiveId, actor.id]
          );
        }
        await this.audit(client, context, {
          action: 'contact.assigned', entityType: 'contact', entityId: id,
          metadata: { previousExecutiveId: before.executiveId, executiveId: data.executiveId ?? null }
        });
      }
      if (data.consentStatus !== undefined && data.consentStatus !== before.consentStatus) {
        await client.query(
          `INSERT INTO contact_consents
             (contact_id,status,captured_at,source,privacy_notice_version,recorded_by)
           VALUES ($1,$2,$3,$4,$5,$6)`,
          [id, data.consentStatus, data.consentAt ?? new Date(), data.source ?? 'crm',
            data.privacyNoticeVersion ?? before.privacyNoticeVersion, actor.id]
        );
      }
      await this.audit(client, context, {
        action: 'contact.updated', entityType: 'contact', entityId: id,
        before, after, metadata: { changedFields: entries.map(([key]) => key) }
      });
      return this.getContact(id, actor, { client });
    });
  }

  async softDeleteContact(id, reason, actor, context, expectedVersion) {
    return withTransaction(this.pool, async (client) => {
      const before = await this.getContact(id, actor, { client });
      if (!before) throw notFound('Contacto');
      const result = await client.query(
        `UPDATE contacts SET deleted_at = now(), deleted_by = $1, delete_reason = $2, updated_by = $1
         WHERE id = $3 AND row_version = $4 AND deleted_at IS NULL RETURNING *`,
        [actor.id, reason, id, expectedVersion]
      );
      if (!result.rows[0]) throw conflict('El contacto cambió desde que lo abriste.');
      const after = contactRow(result.rows[0]);
      await this.audit(client, context, {
        action: 'contact.deleted', entityType: 'contact', entityId: id, before, after,
        metadata: { reason }
      });
      return this.getContact(id, actor, { includeDeleted: true, client });
    });
  }

  async restoreContact(id, actor, context, expectedVersion) {
    return withTransaction(this.pool, async (client) => {
      const before = await this.getContact(id, actor, { includeDeleted: true, client });
      if (!before || !before.deletedAt) throw notFound('Contacto eliminado');
      const result = await client.query(
        `UPDATE contacts SET deleted_at = NULL, deleted_by = NULL, delete_reason = NULL, updated_by = $1
         WHERE id = $2 AND row_version = $3 AND deleted_at IS NOT NULL RETURNING *`,
        [actor.id, id, expectedVersion]
      );
      if (!result.rows[0]) throw conflict('El contacto cambió desde que lo abriste.');
      const after = contactRow(result.rows[0]);
      await this.audit(client, context, {
        action: 'contact.restored', entityType: 'contact', entityId: id, before, after
      });
      return this.getContact(id, actor, { client });
    });
  }

  async listInteractions(contactId, actor) {
    const contact = await this.getContact(contactId, actor);
    if (!contact) throw notFound('Contacto');
    const result = await this.pool.query(
      `SELECT i.*, u.display_name AS actor_name FROM interactions i
       JOIN app_users u ON u.id = i.actor_id
       WHERE i.contact_id = $1 AND i.voided_at IS NULL
       ORDER BY i.occurred_at DESC LIMIT 500`, [contactId]
    );
    return result.rows.map(interactionRow);
  }

  async createInteraction(contactId, data, actor, context) {
    return withTransaction(this.pool, async (client) => {
      const contact = await this.getContact(contactId, actor, { client });
      if (!contact) throw notFound('Contacto');
      const result = await client.query(
        `INSERT INTO interactions (contact_id,actor_id,occurred_at,channel,outcome,notes,is_human_contact)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
        [contactId, actor.id, data.occurredAt, data.channel, data.outcome, data.notes, data.isHumanContact]
      );
      if (data.isHumanContact) {
        await client.query(
          `UPDATE contacts SET last_human_contact_at = GREATEST(COALESCE(last_human_contact_at, '-infinity'), $1),
             updated_by = $2 WHERE id = $3`,
          [data.occurredAt, actor.id, contactId]
        );
      }
      const created = interactionRow(result.rows[0]);
      await this.audit(client, context, {
        action: 'interaction.created', entityType: 'interaction', entityId: created.id,
        metadata: { contactId, channel: data.channel, isHumanContact: data.isHumanContact }
      });
      return {
        ...created,
        actorName: actor.displayName,
        contactName: contact.displayName
      };
    });
  }

  async listAllInteractions({ actor, filters }) {
    const params = [];
    const where = ['i.voided_at IS NULL', 'c.deleted_at IS NULL'];
    if (actor.role === 'executive') {
      params.push(actor.id);
      where.push(`c.executive_id = $${params.length}`);
    } else if (filters.executiveId) {
      params.push(filters.executiveId);
      where.push(`i.actor_id = $${params.length}`);
    }
    if (filters.from) {
      params.push(filters.from);
      where.push(`i.occurred_at >= $${params.length}`);
    }
    if (filters.to) {
      params.push(filters.to);
      where.push(`i.occurred_at <= $${params.length}`);
    }
    const offset = (filters.page - 1) * filters.pageSize;
    params.push(filters.pageSize, offset);
    const result = await this.pool.query(
      `SELECT i.*, concat(c.first_name,' ',c.last_name) AS contact_name,
              u.display_name AS actor_name, count(*) OVER()::integer AS total_count
       FROM interactions i
       JOIN contacts c ON c.id=i.contact_id
       JOIN app_users u ON u.id=i.actor_id
       WHERE ${where.join(' AND ')}
       ORDER BY i.occurred_at DESC,i.id
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    return {
      items: result.rows.map((row) => ({ ...interactionRow(row), contactName: row.contact_name })),
      total: Number(result.rows[0]?.total_count ?? 0)
    };
  }

  async listMemberships(contactId, actor) {
    const contact = await this.getContact(contactId, actor);
    if (!contact) throw notFound('Contacto');
    const result = await this.pool.query(
      `SELECT m.*,
        COALESCE(jsonb_agg(jsonb_build_object(
          'id',u.id,'unitNumber',u.unit_number,'seatIdentifier',u.seat_identifier,
          'zone',u.zone,'product',u.product,'jerseySize',u.jersey_size
        ) ORDER BY u.unit_number) FILTER (WHERE u.id IS NOT NULL), '[]'::jsonb) AS units
       FROM memberships m LEFT JOIN membership_units u ON u.membership_id = m.id AND u.deleted_at IS NULL
       WHERE m.contact_id = $1 AND m.deleted_at IS NULL GROUP BY m.id
       ORDER BY m.season_code DESC, m.created_at DESC`, [contactId]
    );
    return result.rows.map(membershipRow);
  }

  async createMembership(contactId, data, actor, context) {
    return withTransaction(this.pool, async (client) => {
      await this.lockMembershipSeason(client, contactId, data.seasonCode);
      await this.lockMembershipSeats(client, data.seasonCode, data.section, data.units);
      const contact = await this.getContact(contactId, actor, { client });
      if (!contact) throw notFound('Contacto');
      const duplicate = await client.query(
        `SELECT id FROM memberships
         WHERE contact_id=$1 AND season_code=$2 AND deleted_at IS NULL
         ORDER BY created_at DESC,id LIMIT 1`,
        [contactId, data.seasonCode]
      );
      if (duplicate.rows[0]) {
        throw conflict('El contacto ya tiene un abono registrado para esta temporada.');
      }
      await this.assertMembershipSeatsAvailable(client, {
        seasonCode: data.seasonCode,
        section: data.section,
        units: data.units
      });
      const pricing = await this.resolveSubscriptionPricing(client, data);
      const result = await client.query(
        `INSERT INTO memberships
          (contact_id,season_code,membership_status,seat_count,seat_identifier,zone,section,product,
           start_date,renewal_date,created_by,updated_by,
           price_book_version,currency,locality_code,locality_name,discount_code,discount_name,
           pricing_mode,list_unit_price,commercial_value,net_amount,discount_amount,
           effective_unit_price,charged_units,bonus_units)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$11,
                 $12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25) RETURNING *`,
        [contactId, data.seasonCode, data.membershipStatus, data.seatCount,
          data.seatIdentifier ?? null, data.zone ?? null, data.section ?? null,
          data.product ?? null, data.startDate ?? null, data.renewalDate ?? null, actor.id,
          pricing.priceBookVersion, pricing.currency, pricing.localityCode, pricing.localityName,
          pricing.discountCode, pricing.discountName, pricing.pricingMode, pricing.listUnitPrice,
          pricing.commercialValue, pricing.netAmount, pricing.discountAmount,
          pricing.effectiveUnitPrice, pricing.chargedUnits, pricing.bonusUnits]
      );
      const membership = result.rows[0];
      for (const unit of data.units) {
        await client.query(
          `INSERT INTO membership_units
            (membership_id,unit_number,seat_identifier,zone,product,jersey_size,created_by,updated_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$7)`,
          [membership.id, unit.unitNumber, unit.seatIdentifier ?? null, unit.zone ?? null,
            unit.product ?? null, unit.jerseySize ?? null, actor.id]
        );
      }
      await this.audit(client, context, {
        action: 'membership.created', entityType: 'membership', entityId: membership.id,
        metadata: {
          contactId, seasonCode: data.seasonCode,
          section: data.section ?? null, seatCount: data.seatCount,
          ...publicPricing(pricing)
        }
      });
      return membershipRow({ ...membership, units: data.units });
    });
  }

  async updateMembership(id, data, actor, context, expectedVersion) {
    return withTransaction(this.pool, async (client) => {
      const visible = await client.query(
        `SELECT m.* FROM memberships m
         JOIN contacts c ON c.id=m.contact_id AND c.deleted_at IS NULL
         WHERE m.id=$1 AND m.deleted_at IS NULL
           AND ($2::boolean=false OR c.executive_id=$3)`,
        [id, actor.role === 'executive', actor.id]
      );
      if (!visible.rows[0]) throw notFound('Abono');

      const seasonCode = visible.rows[0].season_code;
      await this.lockMembershipSeats(client, seasonCode, data.section, data.units);
      const locked = await client.query(
        `SELECT m.* FROM memberships m
         JOIN contacts c ON c.id=m.contact_id AND c.deleted_at IS NULL
         WHERE m.id=$1 AND m.deleted_at IS NULL
           AND ($2::boolean=false OR c.executive_id=$3)
         FOR UPDATE OF m`,
        [id, actor.role === 'executive', actor.id]
      );
      const membership = locked.rows[0];
      if (!membership) throw notFound('Abono');
      if (Number(membership.row_version) !== expectedVersion) {
        throw conflict('El abono cambió desde que lo abriste. Actualiza la vista e inténtalo de nuevo.');
      }

      const unitResult = await client.query(
        `SELECT * FROM membership_units WHERE membership_id=$1 ORDER BY unit_number FOR UPDATE`,
        [id]
      );
      const before = membershipRow({
        ...membership,
        units: unitResult.rows.filter((unit) => !unit.deleted_at).map(membershipUnitRow)
      });
      await this.assertMembershipSeatsAvailable(client, {
        seasonCode,
        section: data.section,
        units: data.units,
        excludeMembershipId: id
      });
      const pricing = await this.resolveSubscriptionPricing(client, {
        ...data,
        seasonCode
      });

      const updated = await client.query(
        `UPDATE memberships
         SET section=$1,seat_count=$2,updated_by=$3,
             price_book_version=$4,currency=$5,locality_code=$6,locality_name=$7,
             discount_code=$8,discount_name=$9,pricing_mode=$10,list_unit_price=$11,
             commercial_value=$12,net_amount=$13,discount_amount=$14,
             effective_unit_price=$15,charged_units=$16,bonus_units=$17
         WHERE id=$18 AND row_version=$19 AND deleted_at IS NULL
         RETURNING *`,
        [data.section, data.seatCount, actor.id,
          pricing.priceBookVersion, pricing.currency, pricing.localityCode, pricing.localityName,
          pricing.discountCode, pricing.discountName, pricing.pricingMode, pricing.listUnitPrice,
          pricing.commercialValue, pricing.netAmount, pricing.discountAmount,
          pricing.effectiveUnitPrice, pricing.chargedUnits, pricing.bonusUnits,
          id, expectedVersion]
      );
      if (!updated.rows[0]) {
        throw conflict('El abono cambió desde que lo abriste. Actualiza la vista e inténtalo de nuevo.');
      }

      for (const unit of data.units) {
        await client.query(
          `INSERT INTO membership_units
            (membership_id,unit_number,seat_identifier,zone,product,jersey_size,created_by,updated_by)
           VALUES ($1,$2,$3,$4,$5,NULL,$6,$6)
           ON CONFLICT (membership_id,unit_number) DO UPDATE SET
             seat_identifier=excluded.seat_identifier,
             updated_by=excluded.updated_by,
             deleted_at=NULL,
             deleted_by=NULL`,
          [id, unit.unitNumber, unit.seatIdentifier, membership.zone,
            membership.product, actor.id]
        );
      }
      await client.query(
        `UPDATE membership_units
         SET deleted_at=now(),deleted_by=$2,updated_by=$2
         WHERE membership_id=$1 AND unit_number>$3 AND deleted_at IS NULL`,
        [id, actor.id, data.seatCount]
      );

      const after = await this.getMembership(id, { client });
      const beforeSeats = before.units.map((unit) => canonicalSeatIdentifier(unit.seatIdentifier));
      const afterSeats = data.units.map((unit) => canonicalSeatIdentifier(unit.seatIdentifier));
      const changedFields = [];
      if (before.section !== after.section) changedFields.push('section');
      if (before.seatCount !== after.seatCount) changedFields.push('seatCount');
      if (before.localityCode !== after.localityCode) changedFields.push('localityCode');
      if (before.discountCode !== after.discountCode) changedFields.push('discountCode');
      if (JSON.stringify(beforeSeats) !== JSON.stringify(afterSeats)) changedFields.push('seatIdentifiers');
      await this.audit(client, context, {
        action: 'membership.updated', entityType: 'membership', entityId: id,
        before, after,
        metadata: {
          contactId: membership.contact_id,
          priceBookVersion: after.priceBookVersion,
          commercialValue: after.commercialValue,
          netAmount: after.netAmount,
          discountAmount: after.discountAmount,
          chargedUnits: after.chargedUnits,
          bonusUnits: after.bonusUnits,
          changedFields,
          seatIdentifiersChanged: changedFields.includes('seatIdentifiers')
        }
      });
      return after;
    });
  }

  async listTasks({ actor, filters }) {
    const params = [];
    const where = ['t.deleted_at IS NULL', 'c.deleted_at IS NULL'];
    if (actor.role === 'executive') {
      params.push(actor.id);
      where.push(`t.assigned_to = $${params.length}`);
      where.push(`c.executive_id = $${params.length}`);
    } else if (filters.executiveId) {
      params.push(filters.executiveId);
      where.push(`t.assigned_to = $${params.length}`);
    }
    if (filters.contactId) {
      params.push(filters.contactId);
      where.push(`t.contact_id = $${params.length}`);
    }
    if (filters.taskState === 'open') where.push("t.status IN ('pending','in_progress')");
    if (filters.taskState === 'completed') where.push("t.status = 'completed'");
    if (filters.taskState === 'cancelled') where.push("t.status = 'cancelled'");
    if (filters.from) { params.push(filters.from); where.push(`t.due_at >= $${params.length}`); }
    if (filters.to) { params.push(filters.to); where.push(`t.due_at <= $${params.length}`); }
    const offset = (filters.page - 1) * filters.pageSize;
    params.push(filters.pageSize, offset);
    const sort = TASK_SORT[filters.sort] ?? TASK_SORT.dueAt;
    const order = filters.order === 'asc' ? 'ASC' : 'DESC';
    const result = await this.pool.query(
      `SELECT t.*, concat(c.first_name,' ',c.last_name) AS contact_name,
              u.display_name AS assignee_name, count(*) OVER()::integer AS total_count
       FROM tasks t JOIN contacts c ON c.id=t.contact_id JOIN app_users u ON u.id=t.assigned_to
       WHERE ${where.join(' AND ')} ORDER BY ${sort} ${order}, t.id
       LIMIT $${params.length - 1} OFFSET $${params.length}`, params
    );
    return { items: result.rows.map(taskRow), total: Number(result.rows[0]?.total_count ?? 0) };
  }

  async getTask(id, actor, { client = this.pool } = {}) {
    const params = [id];
    const where = ['t.id=$1', 't.deleted_at IS NULL', 'c.deleted_at IS NULL'];
    if (actor.role === 'executive') {
      params.push(actor.id);
      where.push(`t.assigned_to=$${params.length}`);
      where.push(`c.executive_id=$${params.length}`);
    }
    const result = await client.query(
      `SELECT t.*, concat(c.first_name,' ',c.last_name) AS contact_name,
              u.display_name AS assignee_name
       FROM tasks t JOIN contacts c ON c.id=t.contact_id JOIN app_users u ON u.id=t.assigned_to
       WHERE ${where.join(' AND ')}`,
      params
    );
    return result.rows[0] ? taskRow(result.rows[0]) : null;
  }

  async createTask(contactId, data, actor, context) {
    return withTransaction(this.pool, async (client) => {
      const contact = await this.getContact(contactId, actor, { client });
      if (!contact) throw notFound('Contacto');
      const assignee = await this.assertActiveUser(client, data.assignedTo, ['executive', 'supervisor', 'admin']);
      if (assignee.role === 'executive' && contact.executiveId !== assignee.id) {
        throw conflict('La tarea de un Ejecutivo debe pertenecer a un contacto de su cartera actual.');
      }
      const result = await client.query(
        `INSERT INTO tasks (contact_id,assigned_to,created_by,description,due_at,priority,status)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
        [contactId, data.assignedTo, actor.id, data.description, data.dueAt,
          data.priority ?? 'normal', data.status ?? 'pending']
      );
      await this.recomputeNextFollowUp(client, contactId, actor.id);
      const created = taskRow(result.rows[0]);
      await this.audit(client, context, {
        action: 'task.created', entityType: 'task', entityId: created.id,
        after: created, metadata: { contactId }
      });
      return this.getTask(created.id, actor, { client });
    });
  }

  async updateTask(id, data, actor, context, expectedVersion) {
    return withTransaction(this.pool, async (client) => {
      const existingResult = await client.query(
        `SELECT * FROM tasks WHERE id=$1 AND deleted_at IS NULL
         AND ($2::boolean = false OR (
           assigned_to=$3 AND EXISTS (
             SELECT 1 FROM contacts c
             WHERE c.id=tasks.contact_id AND c.deleted_at IS NULL AND c.executive_id=$3
           )
         )) FOR UPDATE`,
        [id, actor.role === 'executive', actor.id]
      );
      const before = existingResult.rows[0] ? taskRow(existingResult.rows[0]) : null;
      if (!before) throw notFound('Tarea');
      const columns = { assignedTo: 'assigned_to', dueAt: 'due_at', status: 'status', priority: 'priority', description: 'description' };
      const entries = Object.entries(data).filter(([key]) => columns[key]);
      if (!entries.length) throw conflict('No hay campos editables para actualizar.');
      if (data.assignedTo) {
        const assignee = await this.assertActiveUser(client, data.assignedTo, ['executive', 'supervisor', 'admin']);
        if (assignee.role === 'executive') {
          const owner = await client.query(
            'SELECT executive_id FROM contacts WHERE id=$1 AND deleted_at IS NULL',
            [before.contactId]
          );
          if (owner.rows[0]?.executive_id !== assignee.id) {
            throw conflict('La tarea de un Ejecutivo debe pertenecer a un contacto de su cartera actual.');
          }
        }
      }
      const values = entries.map(([, value]) => value);
      const sets = entries.map(([key], index) => `${columns[key]}=$${index + 1}`);
      if (data.status === 'completed') sets.push('completed_at=now()');
      if (data.status && data.status !== 'completed') sets.push('completed_at=NULL');
      values.push(id, expectedVersion);
      const result = await client.query(
        `UPDATE tasks SET ${sets.join(',')} WHERE id=$${entries.length + 1} AND row_version=$${entries.length + 2}
         RETURNING *`, values
      );
      if (!result.rows[0]) throw conflict('La tarea cambió desde que la abriste.');
      const after = taskRow(result.rows[0]);
      await this.recomputeNextFollowUp(client, before.contactId, actor.id);
      await this.audit(client, context, {
        action: 'task.updated', entityType: 'task', entityId: id, before, after,
        metadata: { changedFields: entries.map(([key]) => key) }
      });
      return this.getTask(after.id, actor, { client });
    });
  }

  async recomputeNextFollowUp(client, contactId, actorId) {
    await client.query(
      `UPDATE contacts c SET next_follow_up_at = (
         SELECT min(t.due_at) FROM tasks t
         WHERE t.contact_id=c.id AND t.deleted_at IS NULL AND t.status IN ('pending','in_progress')
       ), updated_by=$2 WHERE c.id=$1`, [contactId, actorId]
    );
  }

  async listSales({ actor, filters }) {
    const params = [];
    const where = ['s.deleted_at IS NULL'];
    if (actor.role === 'executive') {
      params.push(actor.id);
      where.push(`s.effective_executive_id = $${params.length}`);
    } else if (filters.executiveId) {
      params.push(filters.executiveId);
      where.push(`s.effective_executive_id = $${params.length}`);
    }
    if (filters.season) {
      params.push(filters.season);
      where.push(`s.season_code = $${params.length}`);
    }
    if (filters.from) { params.push(filters.from); where.push(`s.effective_sold_at >= $${params.length}`); }
    if (filters.to) { params.push(filters.to); where.push(`s.effective_sold_at <= $${params.length}`); }
    const offset = (filters.page - 1) * filters.pageSize;
    params.push(filters.pageSize, offset);
    const result = await this.pool.query(
      `SELECT s.*, COALESCE(p.paid_amount,0)::numeric AS paid_amount,
              concat(c.first_name,' ',c.last_name) AS contact_name,
              u.display_name AS executive_name,
              s.effective_items AS items,
              count(*) OVER()::integer AS total_count
       FROM effective_sales s JOIN contacts c ON c.id=s.effective_contact_id LEFT JOIN app_users u ON u.id=s.effective_executive_id
       LEFT JOIN LATERAL (
         SELECT sum(p.amount + COALESCE(a.amount,0)) AS paid_amount
         FROM payments p
         LEFT JOIN LATERAL (
           SELECT sum(amount) AS amount FROM payment_adjustments WHERE payment_id=p.id
         ) a ON true
         WHERE p.sale_id=s.id AND p.voided_at IS NULL
       ) p ON true
       WHERE ${where.join(' AND ')} ORDER BY s.effective_sold_at DESC NULLS LAST,s.created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`, params
    );
    return { items: result.rows.map(saleRow), total: Number(result.rows[0]?.total_count ?? 0) };
  }

  async getSale(id, actor, { client = this.pool } = {}) {
    const params = [id];
    const where = ['s.id=$1', 's.deleted_at IS NULL'];
    if (actor.role === 'executive') {
      params.push(actor.id);
      where.push(`s.effective_executive_id=$${params.length}`);
    }
    const result = await client.query(
      `SELECT s.*, COALESCE(p.paid_amount,0)::numeric AS paid_amount,
              concat(c.first_name,' ',c.last_name) AS contact_name,u.display_name AS executive_name,
              s.effective_items AS items,COALESCE(p.payments,'[]'::jsonb) AS payments
       FROM effective_sales s JOIN contacts c ON c.id=s.effective_contact_id LEFT JOIN app_users u ON u.id=s.effective_executive_id
       LEFT JOIN LATERAL (
         SELECT sum(p.amount + COALESCE(a.amount,0)) AS paid_amount,
           jsonb_agg(jsonb_build_object('id',p.id,'amount',p.amount + COALESCE(a.amount,0),'method',p.method,
             'paidAt',p.paid_at,'reference',p.reference,'createdAt',p.created_at) ORDER BY p.paid_at) AS payments
         FROM payments p
         LEFT JOIN LATERAL (
           SELECT sum(amount) AS amount FROM payment_adjustments WHERE payment_id=p.id
         ) a ON true
         WHERE p.sale_id=s.id AND p.voided_at IS NULL
       ) p ON true
       WHERE ${where.join(' AND ')}`,
      params
    );
    return result.rows[0] ? saleRow(result.rows[0]) : null;
  }

  async createSale(data, actor, context) {
    return withTransaction(this.pool, async (client) => {
      await client.query('SELECT id FROM contacts WHERE id=$1 AND deleted_at IS NULL FOR UPDATE', [data.contactId]);
      const contact = await this.getContact(data.contactId, actor, { client });
      if (!contact) throw notFound('Contacto');
      await this.assertActiveUser(client, data.executiveId, ['executive']);
      const duplicate = await client.query(
        `SELECT id FROM effective_sales
         WHERE season_code=$1 AND upper(effective_external_order_number)=upper($2) AND deleted_at IS NULL
         LIMIT 1`,
        [data.seasonCode, data.externalOrderNumber]
      );
      if (duplicate.rows[0]) {
        throw conflict(`La orden ${data.externalOrderNumber} ya está registrada en esta temporada.`);
      }
      const pricing = data.pricing ? await this.resolveSubscriptionPricing(client, {
        seasonCode: data.seasonCode, ...data.pricing
      }) : null;
      const saleItems = saleItemsFromPricing(data, pricing);
      const total = pricing ? moneyFromCents(pricing.netAmount)
        : saleItems.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
      const paid = data.payments.reduce((sum, payment) => sum + payment.amount, 0);
      if (paid > total) throw conflict('Los pagos no pueden superar el total de la venta.');
      const result = await client.query(
        `INSERT INTO sales
          (external_order_number,sale_type,contact_id,executive_id,season_code,status,sold_at,currency,total_amount,paid_amount,notes,created_by,updated_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$12) RETURNING *`,
        [data.externalOrderNumber, data.saleType, data.contactId, data.executiveId,
          data.seasonCode, data.status, data.soldAt ?? null, data.currency, total, paid,
          data.notes ?? null, actor.id]
      );
      for (const item of saleItems) {
        await client.query(
          `INSERT INTO sale_items (sale_id,product,zone,quantity,unit_price) VALUES ($1,$2,$3,$4,$5)`,
          [result.rows[0].id, item.product, item.zone ?? null, item.quantity, item.unitPrice]
        );
      }
      for (const payment of data.payments) {
        await client.query(
          `INSERT INTO payments (sale_id,amount,method,paid_at,reference,created_by)
           VALUES ($1,$2,$3,$4,$5,$6)`,
          [result.rows[0].id, payment.amount, payment.method, payment.paidAt,
            payment.reference ?? null, actor.id]
        );
      }
      const targetSubscriberStatus = data.saleType === 'renewal' ? 'current_subscriber' : 'new_subscriber';
      if (contact.executiveId !== data.executiveId) {
        await client.query(
          'UPDATE contact_assignments SET ended_at=now() WHERE contact_id=$1 AND ended_at IS NULL',
          [data.contactId]
        );
        await client.query(
          `INSERT INTO contact_assignments (contact_id,executive_id,assigned_by,reason)
           VALUES ($1,$2,$3,'Asignación al registrar venta')`,
          [data.contactId, data.executiveId, actor.id]
        );
      }
      await client.query(
        `UPDATE contacts SET subscriber_status=$2,commercial_stage=$3,executive_id=$4,
           updated_by=$5 WHERE id=$1`,
        [data.contactId, targetSubscriberStatus, data.closeStage, data.executiveId, actor.id]
      );
      if (data.closeStage === 'won') {
        const membershipResult = await client.query(
          `SELECT id FROM memberships
           WHERE contact_id=$1 AND season_code=$2 AND deleted_at IS NULL
           ORDER BY created_at DESC LIMIT 1 FOR UPDATE`,
          [data.contactId, data.seasonCode]
        );
        if (membershipResult.rows[0]) {
          await client.query(
            `UPDATE memberships SET membership_status='active',renewal_date=COALESCE($2,renewal_date),
               updated_by=$3 WHERE id=$1`,
            [membershipResult.rows[0].id, data.soldAt ?? null, actor.id]
          );
        } else {
          const primaryItem = saleItems[0];
          const membershipSeatCount = saleItems.reduce((sum, item) => sum + item.quantity, 0);
          const membership = await client.query(
            `INSERT INTO memberships
              (contact_id,season_code,membership_status,seat_count,zone,section,product,start_date,created_by,updated_by)
             VALUES ($1,$2,'active',$3,$4,'General',$5,$6,$7,$7) RETURNING id`,
            [data.contactId, data.seasonCode, membershipSeatCount, primaryItem.zone ?? null,
              primaryItem.product, data.soldAt ?? new Date(), actor.id]
          );
          for (let index = 1; index <= membershipSeatCount; index += 1) {
            await client.query(
              `INSERT INTO membership_units (membership_id,unit_number,zone,product,created_by,updated_by)
               VALUES ($1,$2,$3,$4,$5,$5)`,
              [membership.rows[0].id, index, primaryItem.zone ?? null, primaryItem.product, actor.id]
            );
          }
        }
      }
      const created = saleRow(result.rows[0]);
      await this.audit(client, context, {
        action: 'sale.created', entityType: 'sale', entityId: created.id, after: created,
        metadata: { itemCount: saleItems.length, paymentCount: data.payments.length,
          externalOrderNumber: data.externalOrderNumber, saleType: data.saleType,
          closeStage: data.closeStage }
      });
      return { ...created, items: saleItems, payments: data.payments };
    });
  }

  async correctSale(saleId, data, actor, context) {
    return withTransaction(this.pool, async (client) => {
      await client.query('SELECT id FROM sales WHERE id=$1 AND deleted_at IS NULL FOR UPDATE', [saleId]);
      const before = await this.getSale(saleId, actor, { client });
      if (!before) throw notFound('Venta');
      await this.assertActiveUser(client, data.executiveId, ['executive']);
      const contact = await this.getContact(data.contactId, actor, { client });
      if (!contact) throw notFound('Contacto');
      const pricing = data.pricing ? await this.resolveSubscriptionPricing(client, {
        seasonCode: data.seasonCode, ...data.pricing
      }) : null;
      const saleItems = saleItemsFromPricing(data, pricing);
      const total = pricing ? moneyFromCents(pricing.netAmount)
        : saleItems.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
      if (before.paidAmount > total) {
        throw conflict('La corrección no puede dejar un total menor que los cobros registrados.');
      }
      const duplicate = await client.query(
        `SELECT id FROM effective_sales
         WHERE season_code=$1 AND upper(effective_external_order_number)=upper($2)
           AND id<>$3 AND deleted_at IS NULL LIMIT 1`,
        [data.seasonCode, data.externalOrderNumber, saleId]
      );
      if (duplicate.rows[0]) throw conflict(`La orden ${data.externalOrderNumber} ya pertenece a otra venta.`);
      const correction = await client.query(
        `INSERT INTO sale_corrections
          (sale_id,external_order_number,sale_type,contact_id,executive_id,status,sold_at,
           total_amount,notes,items,reason,created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,$12) RETURNING id,created_at`,
        [saleId, data.externalOrderNumber, data.saleType, data.contactId, data.executiveId,
          data.status, data.soldAt ?? null, total, data.notes ?? null, JSON.stringify(saleItems),
          data.reason, actor.id]
      );
      const targetSubscriberStatus = data.saleType === 'renewal' ? 'current_subscriber' : 'new_subscriber';
      await client.query(
        `UPDATE contacts SET subscriber_status=$2,commercial_stage=$3,executive_id=$4,updated_by=$5
         WHERE id=$1`,
        [data.contactId, targetSubscriberStatus, data.closeStage, data.executiveId, actor.id]
      );
      const after = await this.getSale(saleId, actor, { client });
      await this.audit(client, context, {
        action: 'sale.corrected', entityType: 'sale', entityId: saleId, before, after,
        metadata: { correctionId: correction.rows[0].id, reason: data.reason }
      });
      return after;
    });
  }

  async addPayment(saleId, data, actor, context) {
    return withTransaction(this.pool, async (client) => {
      // Serializes concurrent payments so two requests cannot overpay the same sale.
      await client.query('SELECT id FROM sales WHERE id=$1 AND deleted_at IS NULL FOR UPDATE', [saleId]);
      const sale = await this.getSale(saleId, actor, { client });
      if (!sale) throw notFound('Venta');
      if (['cancelled', 'refunded'].includes(sale.status)) {
        throw conflict('No se pueden agregar pagos a una venta cancelada o reembolsada.');
      }
      if (sale.paidAmount + data.amount > sale.totalAmount) {
        throw conflict('El pago supera el saldo pendiente de la venta.');
      }
      const result = await client.query(
        `INSERT INTO payments (sale_id,amount,method,paid_at,reference,created_by)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
        [saleId, data.amount, data.method, data.paidAt, data.reference ?? null, actor.id]
      );
      const created = paymentRow(result.rows[0]);
      await this.audit(client, context, {
        action: 'payment.created', entityType: 'payment', entityId: created.id,
        metadata: { saleId, amount: created.amount }
      });
      return created;
    });
  }

  async listExecutives({ active = true } = {}) {
    const result = await this.pool.query(
      `SELECT id,display_name,active FROM app_users
       WHERE role='executive' AND deleted_at IS NULL AND ($1::boolean IS NULL OR active=$1)
       ORDER BY active DESC,display_name`,
      [active]
    );
    return result.rows.map((row) => ({
      id: row.id,
      displayName: row.display_name,
      active: row.active
    }));
  }

  async updateUser(id, data, actor, context, expectedVersion) {
    return withTransaction(this.pool, async (client) => {
      const beforeResult = await client.query('SELECT * FROM app_users WHERE id=$1 AND deleted_at IS NULL FOR UPDATE', [id]);
      const before = userRow(beforeResult.rows[0]);
      if (!before) throw notFound('Usuario');
      const columns = {
        entraObjectId: 'entra_object_id', email: 'email', displayName: 'display_name',
        role: 'role', active: 'active'
      };
      const entries = Object.entries(data).filter(([key]) => columns[key]);
      const values = entries.map(([, value]) => value);
      const sets = entries.map(([key], index) => `${columns[key]}=$${index + 1}`);
      values.push(id, expectedVersion);
      const result = await client.query(
        `UPDATE app_users SET ${sets.join(',')} WHERE id=$${entries.length + 1}
         AND row_version=$${entries.length + 2} RETURNING *`, values
      );
      if (!result.rows[0]) throw conflict('El usuario cambió desde que lo abriste.');
      const after = userRow(result.rows[0]);
      await this.audit(client, context, {
        action: 'user.updated', entityType: 'user', entityId: id, before, after,
        metadata: { changedFields: entries.map(([key]) => key) }
      });
      return this.getUser(after.id, { client });
    });
  }

  async setUserPermissions(userId, grants, actor, context) {
    return withTransaction(this.pool, async (client) => {
      const existing = await client.query('SELECT * FROM app_users WHERE id=$1 AND deleted_at IS NULL', [userId]);
      if (!existing.rows[0]) throw notFound('Usuario');
      for (const grant of grants) {
        await client.query(
          `INSERT INTO user_permission_grants (user_id,permission,allowed,granted_by)
           VALUES ($1,$2,$3,$4)
           ON CONFLICT (user_id,permission) DO UPDATE
             SET allowed=excluded.allowed,granted_by=excluded.granted_by,granted_at=now()`,
          [userId, grant.permission, grant.allowed, actor.id]
        );
      }
      await this.audit(client, context, {
        action: 'user.permissions_updated', entityType: 'user', entityId: userId,
        metadata: { grants }
      });
      return grants;
    });
  }

  async exportContacts({ actor, filters, context }) {
    const { params, where } = this.buildContactFilter({
      ...filters, includeDeleted: false, deletedOnly: false
    }, actor);
    params.push(this.exportRowLimit);
    const result = await withTransaction(this.pool, async (client) => {
      const rows = await client.query(
        `SELECT c.id,concat(c.first_name,' ',c.last_name) AS name,c.email,c.phone,c.municipality,
                c.subscriber_status,c.commercial_stage,u.display_name AS executive_name,
                c.last_human_contact_at,s.last_human_contact_channel,
                c.next_follow_up_at,c.consent_status,
                sm.membership_section,sm.membership_seat_count,sm.membership_seats,
                sm.membership_locality_code,sm.membership_locality_name,
                sm.membership_discount_code,sm.membership_discount_name,
                sm.membership_price_book_version,sm.membership_currency,
                sm.membership_list_unit_price,sm.membership_commercial_value,
                sm.membership_net_amount,sm.membership_discount_amount,
                sm.membership_effective_unit_price,sm.membership_charged_units,
                sm.membership_bonus_units
         FROM contacts c LEFT JOIN app_users u ON u.id=c.executive_id
         LEFT JOIN contact_operational_summary s ON s.id=c.id
         ${SELECTED_MEMBERSHIP_JOIN}
         WHERE ${where} ORDER BY c.updated_at DESC LIMIT $${params.length}`, params
      );
      await this.audit(client, context, {
        action: 'data.exported', entityType: 'contact', metadata: { rowCount: rows.rowCount }
      });
      return rows.rows.map((row) => ({
        ...row,
        membership_seats: Array.isArray(row.membership_seats)
          ? row.membership_seats.filter(Boolean).join(' | ')
          : '',
        membership_list_unit_price: moneyFromCents(row.membership_list_unit_price),
        membership_commercial_value: moneyFromCents(row.membership_commercial_value),
        membership_net_amount: moneyFromCents(row.membership_net_amount),
        membership_discount_amount: moneyFromCents(row.membership_discount_amount),
        membership_effective_unit_price: moneyFromCents(row.membership_effective_unit_price)
      }));
    });
    return result;
  }

  async recordDashboardPdfExport(actor, event, context) {
    await this.pool.query(
      `INSERT INTO audit_events
         (actor_id,action,entity_type,request_id,metadata,ip_hash,user_agent)
       VALUES ($1,'dashboard.pdf_requested','dashboard',$2,$3,$4,$5)`,
      [actor.id, context.requestId, {
        filters: event.filters
      }, context.ipHash ?? null, context.userAgent?.slice(0, 500) ?? null]
    );
  }

  async synchronizeOperationalDataset(dataset, actor, context) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SELECT pg_advisory_xact_lock(hashtext('charros-crm-operational-dataset'))`);
      const prior = await client.query(
        'SELECT metrics,imported_at FROM operational_dataset_runs WHERE dataset_sha256=$1',
        [dataset.datasetSha256]
      );
      if (prior.rowCount) {
        await client.query('ROLLBACK');
        return { status: 'already_applied', metrics: prior.rows[0].metrics, importedAt: prior.rows[0].imported_at };
      }

      await client.query(
        `UPDATE app_users SET display_name=CASE email
           WHEN 'crm.assignment.esmeralda@charrosjalisco.com' THEN 'ESMERALDA RUVALCABA'
           WHEN 'crm.assignment.jesus@charrosjalisco.com' THEN 'JESÚS GONZÁLEZ'
           WHEN 'crm.assignment.rosana@charrosjalisco.com' THEN 'ROSAANA'
           ELSE display_name END
         WHERE email IN ('crm.assignment.esmeralda@charrosjalisco.com','crm.assignment.jesus@charrosjalisco.com','crm.assignment.rosana@charrosjalisco.com')`
      );
      const users = await client.query(
        `SELECT id,split_part(email,'@',1) AS code FROM app_users
         WHERE email IN ('crm.assignment.esmeralda@charrosjalisco.com','crm.assignment.jesus@charrosjalisco.com','crm.assignment.rosana@charrosjalisco.com')
           AND deleted_at IS NULL`
      );
      const executiveIds = Object.fromEntries(users.rows.map((row) => [row.code.replace('crm.assignment.', ''), row.id]));
      const contacts = dataset.contacts.map((item) => ({ ...item, executiveId: executiveIds[item.executiveCode] ?? null }));
      const sales = dataset.sales.map((item) => ({ ...item, executiveId: executiveIds[item.executiveCode] ?? null }));
      const salesRows = sales.map((item) => ({
        id: item.id, contact_id: item.contactId, executive_id: item.executiveId,
        sold_at: item.soldAt, total: item.total, paid: item.paid, seats: item.seats,
        zone: item.zone, external_ref: item.externalRef, kind: item.kind
      }));

      await client.query(
        `UPDATE contacts SET deleted_at=now(),deleted_by=$1,
           delete_reason='Fuera del universo operativo auditado LMP 2026-2027'
         WHERE deleted_at IS NULL`, [actor.id]
      );
      await client.query(
        `INSERT INTO contacts
          (id,external_ref,first_name,last_name,email,phone,subscriber_status,commercial_stage,
           executive_id,source,consent_status,summary_notes,is_commitment_only,created_by,updated_by)
         SELECT x.id,x.external_ref,x.first_name,x.last_name,x.email,x.phone,x.subscriber_status,
           x.commercial_stage,x.executive_id,$2,'unknown',x.notes,x.is_commitment_only,$1,$1
         FROM jsonb_to_recordset($3::jsonb) AS x(
           id uuid,external_ref text,first_name text,last_name text,email text,phone text,
           subscriber_status text,commercial_stage text,executive_id uuid,notes text,is_commitment_only boolean
         )`, [actor.id, dataset.source, JSON.stringify(contacts.map((item) => ({
          id: item.id, external_ref: item.externalRef, first_name: item.firstName, last_name: item.lastName,
          email: item.email, phone: item.phone, subscriber_status: item.subscriberStatus,
          commercial_stage: item.commercialStage, executive_id: item.executiveId,
          notes: item.notes, is_commitment_only: item.isCommitmentOnly
        })))]
      );
      await client.query(
        `INSERT INTO memberships
          (id,contact_id,season_code,membership_status,seat_count,zone,product,start_date,renewal_date,
           section,created_by,updated_by)
         SELECT x.id,x.contact_id,'LMP-2026-27','active',x.seat_count,x.zone,x.product,
           COALESCE(x.renewal_date,current_date),x.renewal_date,x.section,$1,$1
         FROM jsonb_to_recordset($2::jsonb) AS x(
           id uuid,contact_id uuid,seat_count integer,zone text,product text,renewal_date date,section text
         )`, [actor.id, JSON.stringify(dataset.memberships.map((item) => ({
          id: item.id, contact_id: item.contactId, seat_count: item.seatCount, zone: item.zone,
          product: item.product, renewal_date: item.renewalDate?.slice(0, 10) || null, section: item.section
        })))]
      );
      await client.query(
        `INSERT INTO membership_units
          (id,membership_id,unit_number,seat_identifier,zone,product,created_by,updated_by)
         SELECT x.id,x.membership_id,x.unit_number,x.seat_identifier,x.zone,x.product,$1,$1
         FROM jsonb_to_recordset($2::jsonb) AS x(
           id uuid,membership_id uuid,unit_number integer,seat_identifier text,zone text,product text
         )`, [actor.id, JSON.stringify(dataset.units.map((item) => ({
          id: item.id, membership_id: item.membershipId, unit_number: item.unitNumber,
          seat_identifier: item.seatIdentifier, zone: item.zone, product: item.product
        })))]
      );
      await client.query(
        `INSERT INTO sales
          (id,contact_id,executive_id,season_code,status,sold_at,total_amount,paid_amount,notes,created_by,updated_by)
         SELECT x.id,x.contact_id,x.executive_id,'LMP-2026-27','confirmed',x.sold_at,
           x.total,x.paid,'BoletoMóvil orden ' || x.external_ref || ' · ' || x.kind,$1,$1
         FROM jsonb_to_recordset($2::jsonb) AS x(
           id uuid,contact_id uuid,executive_id uuid,sold_at timestamptz,total numeric,paid numeric,external_ref text,kind text
         )`, [actor.id, JSON.stringify(salesRows)]
      );
      await client.query(
        `INSERT INTO sale_items (id,sale_id,product,zone,quantity,unit_price)
         SELECT gen_random_uuid(),x.id,x.kind,x.zone,x.seats,
           CASE WHEN x.seats > 0 THEN round(x.total/x.seats,2) ELSE x.total END
         FROM jsonb_to_recordset($1::jsonb) AS x(id uuid,kind text,zone text,seats integer,total numeric)`,
        [JSON.stringify(salesRows)]
      );
      await client.query(
        `INSERT INTO payments (id,sale_id,amount,method,paid_at,reference,created_by)
         SELECT gen_random_uuid(),x.id,x.paid,'BoletoMóvil',x.sold_at,x.external_ref,$1
         FROM jsonb_to_recordset($2::jsonb) AS x(id uuid,paid numeric,sold_at timestamptz,external_ref text)
         WHERE x.paid > 0`, [actor.id, JSON.stringify(salesRows)]
      );
      await client.query(
        `INSERT INTO operational_dataset_runs (dataset_sha256,source_label,metrics,imported_by)
         VALUES ($1,$2,$3,$4)`, [dataset.datasetSha256, dataset.source, dataset.metrics, actor.id]
      );
      await client.query(
        `INSERT INTO audit_events
          (actor_id,action,entity_type,entity_id,request_id,metadata,ip_hash,user_agent)
         VALUES ($1,'dataset.operational_synchronized','operational_dataset',$2,$3,$4,$5,$6)`,
        [actor.id, dataset.datasetSha256, context.requestId, dataset.metrics,
          context.ipHash ?? null, context.userAgent?.slice(0, 500) ?? null]
      );
      const verification = await client.query(
        `SELECT
           (SELECT count(*)::integer FROM contacts WHERE deleted_at IS NULL) AS contacts,
           (SELECT count(*)::integer FROM memberships m JOIN contacts c ON c.id=m.contact_id
             WHERE m.deleted_at IS NULL AND c.deleted_at IS NULL) AS memberships,
           (SELECT count(*)::integer FROM membership_units u JOIN memberships m ON m.id=u.membership_id
             JOIN contacts c ON c.id=m.contact_id WHERE u.deleted_at IS NULL AND m.deleted_at IS NULL AND c.deleted_at IS NULL) AS units,
           (SELECT count(*)::integer FROM sales s JOIN contacts c ON c.id=s.contact_id
             WHERE s.deleted_at IS NULL AND c.deleted_at IS NULL) AS sales`
      );
      const actual = Object.fromEntries(Object.entries(verification.rows[0]).map(([name, value]) => [name, Number(value)]));
      if (Object.entries(dataset.metrics).some(([name, value]) => actual[name] !== value)) {
        throw new Error(`OPERATIONAL_DATASET_VERIFICATION_FAILED:${JSON.stringify(actual)}`);
      }
      await client.query('COMMIT');
      return { status: 'synchronized', metrics: actual, datasetSha256: dataset.datasetSha256 };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async getOperationalSyncActor() {
    const result = await this.pool.query(
      `SELECT id,email,display_name,role FROM app_users
       WHERE role='admin' AND active=true AND deleted_at IS NULL ORDER BY created_at`
    );
    if (result.rowCount !== 1) throw new Error(`EXACTLY_ONE_ACTIVE_ADMIN_REQUIRED:${result.rowCount}`);
    return {
      id: result.rows[0].id,
      email: result.rows[0].email,
      displayName: result.rows[0].display_name,
      role: result.rows[0].role
    };
  }

  async listAuditEvents({ page, pageSize, actorId, entityType }) {
    const params = [];
    const where = [];
    if (actorId) { params.push(actorId); where.push(`a.actor_id=$${params.length}`); }
    if (entityType) { params.push(entityType); where.push(`a.entity_type=$${params.length}`); }
    const offset = (page - 1) * pageSize;
    params.push(pageSize, offset);
    const result = await this.pool.query(
      `SELECT a.id,a.occurred_at,a.actor_id,u.display_name AS actor_name,a.action,a.entity_type,
              a.entity_id,a.request_id,a.before_state,a.after_state,a.metadata,
              count(*) OVER()::integer AS total_count
       FROM audit_events a LEFT JOIN app_users u ON u.id=a.actor_id
       ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
       ORDER BY a.occurred_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`, params
    );
    return { items: result.rows, total: Number(result.rows[0]?.total_count ?? 0) };
  }
}
