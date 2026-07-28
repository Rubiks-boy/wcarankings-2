CREATE TABLE person_metric_values AS
WITH scoped AS (
  SELECT result_type, 'world' AS scope, '' AS region_id, person_id, event_id,
    world_rank AS event_rank, result_value AS personal_result
  FROM person_event_rankings
  UNION ALL
  SELECT result_type, 'continent', continent_id, person_id, event_id,
    continent_rank, result_value
  FROM person_event_rankings WHERE continent_id <> ''
  UNION ALL
  SELECT result_type, 'country', country_id, person_id, event_id,
    country_rank, result_value
  FROM person_event_rankings WHERE country_id <> ''
), references_by_scope AS (
  SELECT *,
    MIN(personal_result) OVER (
      PARTITION BY result_type, scope, region_id, event_id
    ) AS reference_result
  FROM scoped
)
SELECT
  'sum_of_ranks' AS metric,
  1 AS metric_version,
  1 AS event_set_version,
  result_type, scope, region_id, person_id, event_id, event_rank,
  personal_result, reference_result,
  CAST(event_rank AS DECIMAL(18, 6)) AS metric_value
FROM references_by_scope
UNION ALL
SELECT
  'kinch', 1, 1,
  result_type, scope, region_id, person_id, event_id, event_rank,
  personal_result, reference_result,
  CAST(100.0 * reference_result / personal_result AS DECIMAL(18, 6))
FROM references_by_scope
WHERE event_id <> '333mbf' AND personal_result > 0;

ALTER TABLE person_metric_values
  ADD PRIMARY KEY (
    metric, metric_version, event_set_version, result_type,
    scope, region_id, person_id, event_id
  ),
  ADD INDEX idx_person_metric_values_person (
    metric, metric_version, event_set_version, result_type,
    scope, region_id, person_id, event_id
  );
