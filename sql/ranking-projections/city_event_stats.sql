CREATE TABLE city_event_stats AS
WITH ordered AS (
  SELECT *,
    ROW_NUMBER() OVER (
      PARTITION BY competition_city_name, competition_country_id, event_id
      ORDER BY best <= 0, best, competition_start_date, competition_id, result_id
    ) AS single_choice,
    ROW_NUMBER() OVER (
      PARTITION BY competition_city_name, competition_country_id, event_id
      ORDER BY average <= 0, average, competition_start_date, competition_id, result_id
    ) AS average_choice
  FROM result_facts
  WHERE competition_city_name <> ''
)
SELECT
  competition_city_name AS city_name,
  competition_country_id AS country_id,
  event_id,
  MIN(NULLIF(best, 0)) AS fastest_single,
  MAX(CASE WHEN single_choice = 1 AND best > 0 THEN result_id END) AS fastest_single_result_id,
  MIN(NULLIF(average, 0)) AS fastest_average,
  MAX(CASE WHEN average_choice = 1 AND average > 0 THEN result_id END) AS fastest_average_result_id
FROM ordered
GROUP BY competition_city_name, competition_country_id, event_id;

ALTER TABLE city_event_stats
  ADD PRIMARY KEY (city_name, country_id, event_id),
  ADD INDEX idx_city_event_single (event_id, fastest_single, country_id, city_name),
  ADD INDEX idx_city_event_average (event_id, fastest_average, country_id, city_name);
