CREATE OR REPLACE VIEW ranking_entries_single_source AS
SELECT
  r.event_id,
  r.person_id,
  COALESCE(p.name, r.person_id) AS person_name,
  COALESCE(p.country_id, '') AS country_id,
  COALESCE(c.name, p.country_id, '') AS country_name,
  COALESCE(c.iso2, '') AS country_iso2,
  COALESCE(c.continent_id, '') AS continent_id,
  r.best,
  COALESCE(b.competition_id, '') AS competition_id,
  COALESCE(comp.name, '') AS competition_name,
  CASE WHEN r.world_rank = 1 THEN 1 ELSE 0 END AS is_world_record,
  CASE WHEN r.continent_rank = 1 THEN 1 ELSE 0 END AS is_continent_record,
  CASE WHEN r.country_rank = 1 THEN 1 ELSE 0 END AS is_country_record,
  r.world_rank,
  r.continent_rank,
  r.country_rank,
  SUM(CASE WHEN r.world_rank > 0 THEN 1 ELSE 0 END) OVER (
    PARTITION BY r.event_id
    ORDER BY r.world_rank, COALESCE(p.name, r.person_id), r.person_id
    ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
  ) AS world_sub_rank,
  SUM(CASE WHEN r.continent_rank > 0 THEN 1 ELSE 0 END) OVER (
    PARTITION BY r.event_id, COALESCE(c.continent_id, '')
    ORDER BY r.continent_rank, COALESCE(p.name, r.person_id), r.person_id
    ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
  ) AS continent_sub_rank,
  SUM(CASE WHEN r.country_rank > 0 THEN 1 ELSE 0 END) OVER (
    PARTITION BY r.event_id, COALESCE(p.country_id, '')
    ORDER BY r.country_rank, COALESCE(p.name, r.person_id), r.person_id
    ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
  ) AS country_sub_rank
FROM ranks_single r
LEFT JOIN persons p ON p.wca_id = r.person_id AND p.sub_id = 1
LEFT JOIN countries c ON c.id = p.country_id
LEFT JOIN wca_best_single b ON b.person_id = r.person_id AND b.event_id = r.event_id
LEFT JOIN competitions comp ON comp.id = b.competition_id;
