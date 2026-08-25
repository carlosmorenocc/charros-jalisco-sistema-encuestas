UPDATE membership_discount_campaigns
SET display_name = '25% de descuento'
WHERE price_book_version = 'LMP-2026-27-v1'
  AND code = 'july25';
