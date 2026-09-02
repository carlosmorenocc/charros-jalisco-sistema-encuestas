-- Reconcile only identities proven by the 2026-09-02 detailed BM order audit.
-- Accounting sales and payments are not duplicated or modified.
CREATE TEMP TABLE bm_holder_reconciliation (
  order_number text NOT NULL,
  holder_key text NOT NULL,
  full_name text NOT NULL,
  email text,
  phone text,
  quantity integer NOT NULL,
  resolution text NOT NULL CHECK (resolution IN ('replace','split'))
) ON COMMIT DROP;

INSERT INTO bm_holder_reconciliation VALUES
  ('14958975','alfonso-sobarzo','ALFONSO SOBARZO','alfonso_sobarzo@hotmail.com','3326313656',3,'replace'),
  ('14627700','dionisio-flores','DIONISIO FLORES',NULL,NULL,2,'replace'),
  ('14860356','emmanuel-elizalde','EMMANUEL ELIZALDE',NULL,NULL,3,'replace'),
  ('14962349','juan-m-vega','JUAN M. VEGA A.',NULL,NULL,3,'replace'),
  ('15379778','mario-alcaraz','MARIO ALCARAZ','malcaraz@kiedere.com.mx','3338413388',2,'replace'),
  ('15379818','mario-alcaraz','MARIO ALCARAZ','malcaraz@kiedere.com.mx','3338413388',2,'replace'),
  ('14871159','hector-m-ascencio','HECTOR M. ASCENCIO',NULL,NULL,4,'replace'),
  ('14856234','luis-h-gomez','LUIS H. GOMEZ V.',NULL,NULL,2,'replace'),
  ('15096881','maria-guadalupe-mendez','MARIA GUADALUPE MENDEZ CASTRO','malu.mendez24@gmail.com','3331900720',2,'replace'),
  ('15168145','mario-navarro','MARIO NAVARRO','marionavarro@carglasmexico.com','3326700595',1,'replace'),
  ('14900595','carlo-carmona','CARLO A. CARMONA A.',NULL,NULL,2,'replace'),
  ('15446797','ivette-alonso','IVETTE ALONSO MONDRAGON','ivette.alonso17@gmail.com','3336263544',1,'split'),
  ('15399057','noah-avila','NOAH FERNANDA AVILA LOPEZ','urb.aviladiego@gmail.com','3324956141',1,'split'),
  ('15399057','sandra-lopez','SANDRA LORENA LOPEZ ARANDA','urb.aviladiego@gmail.com','3324956142',1,'split'),
  ('15380209','jocelyn-martinez','JOCELYN MARTINEZ MAGANA','jocelyn.marmag@gmail.com','3414395326',1,'split'),
  ('15380049','hugo-ruvalcaba','HUGO RUVALCABA','hugoruvalcaba@live.com','3315734042',1,'split'),
  ('15379985','veronica-sanchez','VERONICA SANCHEZ DUENAS','veronicasanche88@hotmail.com','3319907208',1,'split'),
  ('15355309','topete','TOPETE','liz.enazil@gmail.com','3311938428',1,'split'),
  ('15353233','david-sustersick','DAVID SUSTERSICK AGUILERA','davidsustersick@gmail.com','3316041442',1,'split');

DO $$
BEGIN
  IF (SELECT count(*) FROM bm_holder_reconciliation r JOIN effective_sales es
      ON es.effective_external_order_number=r.order_number AND es.deleted_at IS NULL) <> 19 THEN
    RAISE EXCEPTION 'BM holder reconciliation does not match all 19 audited order/person rows';
  END IF;
END $$;

-- One contact per verified person. Shared family contact details are allowed; the
-- external reference is the durable identity established by this audit.
INSERT INTO contacts
  (external_ref,first_name,last_name,email,phone,subscriber_status,commercial_stage,
   executive_id,source,consent_status,summary_notes,created_by,updated_by)
SELECT DISTINCT ON (r.holder_key)
  'BM-HOLDER:'||r.holder_key,
  split_part(r.full_name,' ',1),
  COALESCE(NULLIF(regexp_replace(r.full_name,'^[^ ]+\s*',''),''),'SIN APELLIDO'),
  COALESCE(r.email,r.holder_key||'@bm-holder.invalid'),r.phone,
  CASE es.effective_sale_type WHEN 'renewal' THEN 'current_subscriber' ELSE 'new_subscriber' END,
  'won',es.effective_executive_id,'BOLETOMOVIL_ORDER_HOLDER','unknown',
  'Titular conciliado por numero de orden BM el 2026-09-02.',
  es.created_by,es.updated_by
FROM bm_holder_reconciliation r
JOIN effective_sales es ON es.effective_external_order_number=r.order_number
  AND es.deleted_at IS NULL
ORDER BY r.holder_key,es.effective_sold_at
ON CONFLICT (external_ref) WHERE external_ref IS NOT NULL AND deleted_at IS NULL DO NOTHING;

-- Orders incorrectly attached in full to a similarly named contact.
UPDATE sale_holder_assignments ha
SET contact_id=c.id,source='boletomovil',source_holder_name=r.full_name,
    updated_by=es.updated_by,row_version=ha.row_version+1
FROM bm_holder_reconciliation r
JOIN effective_sales es ON es.effective_external_order_number=r.order_number AND es.deleted_at IS NULL
JOIN contacts c ON c.external_ref='BM-HOLDER:'||r.holder_key AND c.deleted_at IS NULL
WHERE r.resolution='replace' AND ha.sale_id=es.id AND ha.deleted_at IS NULL AND ha.is_primary;

-- Multi-holder orders retain their original primary person and allocate the
-- explicitly named BM seats to independent contacts.
WITH split_totals AS (
  SELECT es.id AS sale_id,sum(r.quantity)::integer AS split_quantity,max(es.updated_by::text)::uuid AS updated_by
  FROM bm_holder_reconciliation r
  JOIN effective_sales es ON es.effective_external_order_number=r.order_number AND es.deleted_at IS NULL
  WHERE r.resolution='split' GROUP BY es.id
)
UPDATE sale_holder_assignments ha
SET quantity=ha.quantity-st.split_quantity,source='boletomovil',
    updated_by=st.updated_by,row_version=ha.row_version+1
FROM split_totals st
WHERE ha.sale_id=st.sale_id AND ha.deleted_at IS NULL AND ha.is_primary
  AND ha.quantity>st.split_quantity;

INSERT INTO sale_holder_assignments
  (sale_id,contact_id,quantity,segment,zone,source,source_holder_name,is_primary,created_by,updated_by)
SELECT es.id,c.id,r.quantity,primary_holder.segment,primary_holder.zone,
       'boletomovil',r.full_name,false,es.created_by,es.updated_by
FROM bm_holder_reconciliation r
JOIN effective_sales es ON es.effective_external_order_number=r.order_number AND es.deleted_at IS NULL
JOIN contacts c ON c.external_ref='BM-HOLDER:'||r.holder_key AND c.deleted_at IS NULL
JOIN sale_holder_assignments primary_holder ON primary_holder.sale_id=es.id
  AND primary_holder.is_primary AND primary_holder.deleted_at IS NULL
WHERE r.resolution='split'
ON CONFLICT (sale_id,contact_id,segment,(COALESCE(zone,''))) WHERE deleted_at IS NULL DO NOTHING;

-- Proven spelling/label variants remain aliases, not additional people.
INSERT INTO contact_aliases (contact_id,alias_type,alias_value,source_system)
SELECT DISTINCT ha.contact_id,'name',aliases.alias_name,'BOLETOMOVIL'
FROM (VALUES
  ('14957727','ARMANDO ROJAS GACRIA'),
  ('14627095','ARTURO MUNOZ R'),
  ('14726995','GUILLERMO ORTIZ A.'),
  ('15432165','16 HERMANOS / FABY')
) aliases(order_number,alias_name)
JOIN effective_sales es ON es.effective_external_order_number=aliases.order_number AND es.deleted_at IS NULL
JOIN sale_holder_assignments ha ON ha.sale_id=es.id AND ha.is_primary AND ha.deleted_at IS NULL
ON CONFLICT (contact_id,alias_type,alias_value) DO NOTHING;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM effective_sales es
    JOIN LATERAL (
      SELECT COALESCE(sum((item->>'quantity')::integer),0)::integer AS sold_quantity
      FROM jsonb_array_elements(es.effective_items) item
    ) sold ON true
    LEFT JOIN LATERAL (
      SELECT COALESCE(sum(ha.quantity),0)::integer AS assigned_quantity
      FROM sale_holder_assignments ha WHERE ha.sale_id=es.id AND ha.deleted_at IS NULL
    ) assigned ON true
    WHERE es.deleted_at IS NULL AND sold.sold_quantity<>assigned.assigned_quantity
  ) THEN
    RAISE EXCEPTION 'Holder reconciliation does not preserve the documented sale quantity';
  END IF;
END $$;
