-- Cancel the explicitly reported duplicate order while preserving the immutable ledger.
INSERT INTO sale_corrections (
  sale_id, external_order_number, sale_type, contact_id, executive_id, status,
  sold_at, total_amount, notes, items, reason, created_by
)
SELECT
  sale.id, sale.effective_external_order_number, sale.effective_sale_type,
  sale.effective_contact_id, sale.effective_executive_id, 'cancelled',
  sale.effective_sold_at, sale.effective_total_amount, sale.effective_notes,
  sale.effective_items, 'Orden duplicada 15420812 anulada por solicitud operativa',
  sale.created_by
FROM effective_sales sale
WHERE sale.deleted_at IS NULL
  AND sale.season_code = 'LMP-2026-27'
  AND upper(sale.effective_external_order_number) = '15420812'
  AND sale.effective_status NOT IN ('cancelled', 'refunded');

UPDATE memberships membership
SET membership_status = 'cancelled',
    updated_at = now(),
    row_version = membership.row_version + 1
FROM contacts contact
WHERE contact.id = membership.contact_id
  AND membership.deleted_at IS NULL
  AND membership.product LIKE '%· ORDEN 15420812';
