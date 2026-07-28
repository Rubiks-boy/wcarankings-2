CREATE TABLE competition_stats AS
SELECT
  comp.id AS competition_id,
  STR_TO_DATE(CONCAT(comp.year, '-', LPAD(comp.month, 2, '0'), '-', LPAD(comp.day, 2, '0')), '%Y-%m-%d') AS start_date,
  comp.latitude_microdegrees AS latitude,
  comp.longitude_microdegrees AS longitude,
  COUNT(DISTINCT facts.person_id) AS competitor_count,
  COUNT(DISTINCT facts.person_country_id) AS country_count,
  COUNT(DISTINCT facts.event_id) AS event_count,
  COALESCE(SUM(facts.attempt_count), 0) AS attempt_count,
  SUM(
    CASE
      WHEN facts.regional_single_record <> '' OR facts.regional_average_record <> ''
      THEN 1 ELSE 0
    END
  ) AS record_count
FROM competitions comp
LEFT JOIN result_facts facts ON facts.competition_id = comp.id
GROUP BY
  comp.id, comp.year, comp.month, comp.day,
  comp.latitude_microdegrees, comp.longitude_microdegrees;

ALTER TABLE competition_stats
  ADD PRIMARY KEY (competition_id),
  ADD INDEX idx_competition_stats_latitude (latitude, competition_id),
  ADD INDEX idx_competition_stats_competitors (competitor_count, competition_id);
