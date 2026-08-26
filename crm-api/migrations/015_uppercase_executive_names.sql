-- Keep executive labels consistent in selectors, sales and executive reports.
UPDATE app_users
SET display_name = upper(display_name),
    updated_at = now()
WHERE role = 'executive'
  AND deleted_at IS NULL
  AND display_name <> upper(display_name);

-- Carlos represents the online sales channel while remaining an assignment-only
-- profile (no local credential is created by this migration).
INSERT INTO app_users (email, display_name, role, active)
SELECT 'crm.assignment.carlos@charrosjalisco.com', 'CARLOS', 'executive', true
WHERE NOT EXISTS (
  SELECT 1 FROM app_users
  WHERE lower(email) = 'crm.assignment.carlos@charrosjalisco.com'
    AND deleted_at IS NULL
);

-- The approved BoletoMóvil cut used "VENTA EN LÍNEA" for Carlos. Sales are an
-- append-only ledger, so reconcile those imported rows through the same
-- immutable correction mechanism used by the CRM instead of updating sales.
INSERT INTO sale_corrections
  (sale_id, external_order_number, sale_type, contact_id, executive_id, status,
   sold_at, total_amount, notes, items, reason, created_by)
SELECT
  sale.id,
  COALESCE(
    sale.external_order_number,
    NULLIF(substring(sale.notes FROM '^BoletoMóvil orden ([^ ·]+)'), ''),
    sale.id::text
  ),
  sale.sale_type,
  sale.contact_id,
  executive.id,
  sale.status,
  sale.sold_at,
  sale.total_amount,
  sale.notes,
  items.value,
  'Conciliación histórica de venta en línea bajo CARLOS',
  sale.created_by
FROM sales AS sale
CROSS JOIN app_users AS executive
CROSS JOIN LATERAL (
  SELECT jsonb_agg(jsonb_build_object(
    'id', item.id,
    'product', item.product,
    'zone', item.zone,
    'quantity', item.quantity,
    'unitPrice', item.unit_price,
    'lineTotal', item.line_total
  ) ORDER BY item.id) AS value
  FROM sale_items AS item
  WHERE item.sale_id = sale.id
) AS items
WHERE executive.email = 'crm.assignment.carlos@charrosjalisco.com'
  AND executive.deleted_at IS NULL
  AND sale.executive_id IS NULL
  AND sale.deleted_at IS NULL
  AND sale.notes LIKE 'BoletoMóvil orden %'
  AND items.value IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM sale_corrections WHERE sale_id = sale.id);

-- Keep the contact owner aligned with its online purchase when it is currently
-- unassigned. Existing explicit assignments are preserved.
UPDATE contacts AS contact
SET executive_id = executive.id,
    updated_at = now()
FROM app_users AS executive
WHERE executive.email = 'crm.assignment.carlos@charrosjalisco.com'
  AND executive.deleted_at IS NULL
  AND contact.executive_id IS NULL
  AND contact.deleted_at IS NULL
  AND EXISTS (
    SELECT 1 FROM effective_sales AS sale
    WHERE sale.effective_contact_id = contact.id
      AND sale.effective_executive_id = executive.id
      AND sale.deleted_at IS NULL
  );
