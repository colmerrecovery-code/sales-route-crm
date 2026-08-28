-- Run on a schedule (cron / pg_cron) to move tier1 customers with no purchase in 365+ days to tier3
UPDATE customers
   SET tier = 'tier3'
 WHERE tier = 'tier1'
   AND last_purchase_at IS NOT NULL
   AND last_purchase_at < now() - INTERVAL '365 days';
