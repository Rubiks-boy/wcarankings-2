CREATE TABLE result_facts AS
SELECT
  r.id AS result_id,
  r.event_id,
  r.person_id,
  r.person_country_id,
  COALESCE(country.continent_id, '') AS person_continent_id,
  r.competition_id,
  comp.country_id AS competition_country_id,
  comp.city_name AS competition_city_name,
  STR_TO_DATE(CONCAT(comp.year, '-', LPAD(comp.month, 2, '0'), '-', LPAD(comp.day, 2, '0')), '%Y-%m-%d') AS competition_start_date,
  STR_TO_DATE(CONCAT(comp.end_year, '-', LPAD(comp.end_month, 2, '0'), '-', LPAD(comp.end_day, 2, '0')), '%Y-%m-%d') AS competition_end_date,
  comp.year AS competition_year,
  DATE_SUB(
    STR_TO_DATE(CONCAT(comp.year, '-', LPAD(comp.month, 2, '0'), '-', LPAD(comp.day, 2, '0')), '%Y-%m-%d'),
    INTERVAL WEEKDAY(STR_TO_DATE(CONCAT(comp.year, '-', LPAD(comp.month, 2, '0'), '-', LPAD(comp.day, 2, '0')), '%Y-%m-%d')) DAY
  ) AS competition_week_start,
  r.round_type_id,
  round_type.rank AS round_rank,
  COALESCE(round_type.final, 0) AS is_final_round,
  r.format_id,
  r.pos AS position,
  r.best,
  r.average,
  CAST(NULL AS SIGNED) AS value1,
  CAST(NULL AS SIGNED) AS value2,
  CAST(NULL AS SIGNED) AS value3,
  CAST(NULL AS SIGNED) AS value4,
  CAST(NULL AS SIGNED) AS value5,
  COALESCE(format.expected_solve_count, 0) AS attempt_count,
  COALESCE(r.regional_single_record, '') AS regional_single_record,
  COALESCE(r.regional_average_record, '') AS regional_average_record
FROM results r
INNER JOIN competitions comp ON comp.id = r.competition_id
LEFT JOIN countries country ON country.id = r.person_country_id
LEFT JOIN round_types round_type ON round_type.id = r.round_type_id
LEFT JOIN formats format ON format.id = r.format_id;

ALTER TABLE result_facts
  ADD PRIMARY KEY (result_id),
  ADD INDEX idx_result_facts_person_event_date (person_id, event_id, competition_start_date, result_id),
  ADD INDEX idx_result_facts_competition_event (competition_id, event_id, result_id),
  ADD INDEX idx_result_facts_event_single (event_id, best, result_id),
  ADD INDEX idx_result_facts_event_average (event_id, average, result_id);
