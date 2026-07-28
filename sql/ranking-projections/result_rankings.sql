CREATE TABLE result_rankings AS
WITH values_by_type AS (
  SELECT result_id, 'single' AS result_type, event_id, person_id, competition_id,
    competition_start_date, round_type_id, best AS result_value,
    person_country_id AS country_id, person_continent_id AS continent_id
  FROM result_facts WHERE best > 0
  UNION ALL
  SELECT result_id, 'average', event_id, person_id, competition_id,
    competition_start_date, round_type_id, average,
    person_country_id, person_continent_id
  FROM result_facts WHERE average > 0
)
SELECT
  result_id, result_type, event_id, person_id, competition_id,
  competition_start_date, round_type_id, result_value, country_id, continent_id,
  DENSE_RANK() OVER (PARTITION BY event_id, result_type ORDER BY result_value) AS world_rank,
  DENSE_RANK() OVER (
    PARTITION BY event_id, result_type, continent_id ORDER BY result_value
  ) AS continent_rank,
  DENSE_RANK() OVER (
    PARTITION BY event_id, result_type, country_id ORDER BY result_value
  ) AS country_rank
FROM values_by_type;

ALTER TABLE result_rankings
  ADD PRIMARY KEY (result_id, result_type),
  ADD INDEX idx_result_rankings_world (
    event_id, result_type, result_value, competition_start_date,
    competition_id, person_id, result_id
  ),
  ADD INDEX idx_result_rankings_continent (
    event_id, result_type, continent_id, result_value,
    competition_start_date, competition_id, person_id, result_id
  ),
  ADD INDEX idx_result_rankings_country (
    event_id, result_type, country_id, result_value,
    competition_start_date, competition_id, person_id, result_id
  ),
  ADD INDEX idx_result_rankings_person (
    person_id, event_id, result_type, result_value, result_id
  );
