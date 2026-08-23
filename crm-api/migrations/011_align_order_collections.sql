-- Payments es append-only. Las conciliaciones también forman un ledger
-- inmutable: nunca alteran el movimiento fuente y su suma determina el cobrado.
CREATE TABLE payment_adjustments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id uuid NOT NULL REFERENCES payments(id),
  amount numeric(14,2) NOT NULL CHECK (amount <> 0),
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (payment_id, reason)
);

CREATE TRIGGER payment_adjustments_immutable
  BEFORE UPDATE OR DELETE ON payment_adjustments
  FOR EACH ROW EXECUTE FUNCTION reject_history_mutation();

INSERT INTO payment_adjustments (payment_id, amount, reason)
SELECT id, -amount, 'Conciliación con RECIBIDO · Reporte 2026-08-23 00:49'
FROM payments
WHERE voided_at IS NULL
  AND reference IN (
    '15391893', '15380359', '15380215', '15380060', '15379738', '15376573',
    '15365366', '15340821', '15243415', '15232256', '15206115', '15177665',
    '15177456', '15168145', '15157532', '15157211', '15157101', '15155902',
    '15096881', '15091399', '15043331', '14965101', '14965054', '14958975',
    '14958270', '14957727', '14952023', '14938841', '14881406', '14877084',
    '14855945', '14827323', '14773734', '14756063', '14733454', '14732465',
    '14726691', '14726162', '14724753', '14719217', '14688242', '14687820',
    '14650880', '14649235', '14641237', '14629894', '14629818'
  );
