CREATE TABLE entity_ranking_counts AS
SELECT 'competition_fastest' AS ranking_kind, event_id, 'single' AS result_type, COUNT(*) AS count
FROM competition_event_stats WHERE fastest_single IS NOT NULL GROUP BY event_id
UNION ALL
SELECT 'competition_fastest', event_id, 'average', COUNT(*)
FROM competition_event_stats WHERE fastest_average IS NOT NULL GROUP BY event_id
UNION ALL
SELECT 'podium', event_id, 'single', COUNT(*)
FROM competition_event_stats WHERE podium_single_score IS NOT NULL GROUP BY event_id
UNION ALL
SELECT 'podium', event_id, 'average', COUNT(*)
FROM competition_event_stats WHERE podium_average_score IS NOT NULL GROUP BY event_id
UNION ALL
SELECT 'city', event_id, 'single', COUNT(*)
FROM city_event_stats WHERE fastest_single IS NOT NULL GROUP BY event_id
UNION ALL
SELECT 'city', event_id, 'average', COUNT(*)
FROM city_event_stats WHERE fastest_average IS NOT NULL GROUP BY event_id
UNION ALL
SELECT 'competition_largest', '', '', COUNT(*) FROM competition_stats
UNION ALL
SELECT 'competition_latitude', '', '', COUNT(*)
FROM competition_stats WHERE northernmost_rank IS NOT NULL;

ALTER TABLE entity_ranking_counts
  ADD PRIMARY KEY (ranking_kind, event_id, result_type);
