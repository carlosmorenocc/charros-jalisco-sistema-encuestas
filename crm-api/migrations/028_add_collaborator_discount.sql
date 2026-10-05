-- Official employee benefit for the active LMP 2026-2027 price book.
-- The percentage is stored in basis points: 4000 = 40%.
INSERT INTO membership_discount_campaigns
  (price_book_version,code,display_name,mode,rate_basis_points,selectable,sort_order)
VALUES
  ('LMP-2026-27-v1','collaborator40','Abono para Colaborador','percentage',4000,true,5);
