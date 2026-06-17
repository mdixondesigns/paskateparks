-- Phase 10 prep — add parks.alias for unofficial / local names.
--
-- WP source already carried per-park 'alias' meta on every park (verified
-- in data/wp-export/mysql.sql wp_postmeta rows). The phase-5 migrator
-- skipped it; this restores it. Aliases drive:
--   • Display: "Also known as: <alias>" under the park H1
--   • Search: homepage filter matches against alias as well as name + city
--   • SEO: Google sees both names as relevant for the same page
--
-- Nullable on purpose — most parks won't have a second name worth tracking.

ALTER TABLE parks ADD COLUMN alias text;
