CREATE TABLE person_sum_of_ranks_scores AS
WITH totals AS (
  SELECT
    metric_version,
    event_set_version,
    result_type,
    scope,
    region_id,
    person_id,
    SUM(event_rank) AS score,
    COUNT(*) AS coverage,
    CASE WHEN result_type = 'single' THEN 17 ELSE 16 END AS required_coverage
  FROM person_sum_of_ranks_event_values
  GROUP BY
    metric_version, event_set_version, result_type,
    scope, region_id, person_id
), eligible AS (
  SELECT *
  FROM totals
  WHERE coverage = required_coverage
)
SELECT
  metric_version,
  event_set_version,
  result_type,
  scope,
  region_id,
  person_id,
  score,
  coverage,
  required_coverage,
  RANK() OVER (
    PARTITION BY metric_version, event_set_version, result_type, scope, region_id
    ORDER BY score
  ) AS rank,
  ROW_NUMBER() OVER (
    PARTITION BY metric_version, event_set_version, result_type, scope, region_id
    ORDER BY score, person_id
  ) AS position
FROM eligible;

ALTER TABLE person_sum_of_ranks_scores
  ADD PRIMARY KEY (
    metric_version, event_set_version, result_type,
    scope, region_id, person_id
  ),
  ADD INDEX idx_person_sum_of_ranks_page (
    metric_version, event_set_version, result_type,
    scope, region_id, position, person_id
  );
