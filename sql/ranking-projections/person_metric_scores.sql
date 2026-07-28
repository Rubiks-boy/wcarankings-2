CREATE TABLE person_metric_scores AS
WITH totals AS (
  SELECT
    metric, metric_version, event_set_version, result_type,
    scope, region_id, person_id,
    SUM(metric_value) AS score,
    COUNT(*) AS coverage,
    CASE
      WHEN metric = 'sum_of_ranks' AND result_type = 'single' THEN 17
      WHEN metric = 'sum_of_ranks' AND result_type = 'average' THEN 16
      WHEN metric = 'kinch' AND result_type = 'single' THEN 16
      ELSE 16
    END AS required_coverage
  FROM person_metric_values
  GROUP BY
    metric, metric_version, event_set_version, result_type,
    scope, region_id, person_id
), eligible AS (
  SELECT * FROM totals WHERE coverage = required_coverage
)
SELECT
  metric, metric_version, event_set_version, result_type,
  scope, region_id, person_id, score, coverage, required_coverage,
  DENSE_RANK() OVER (
    PARTITION BY metric, metric_version, event_set_version, result_type, scope, region_id
    ORDER BY CASE WHEN metric = 'kinch' THEN -score ELSE score END
  ) AS rank,
  ROW_NUMBER() OVER (
    PARTITION BY metric, metric_version, event_set_version, result_type, scope, region_id
    ORDER BY CASE WHEN metric = 'kinch' THEN -score ELSE score END, person_id
  ) AS position
FROM eligible;

ALTER TABLE person_metric_scores
  ADD PRIMARY KEY (
    metric, metric_version, event_set_version, result_type,
    scope, region_id, person_id
  ),
  ADD INDEX idx_person_metric_scores_page (
    metric, metric_version, event_set_version, result_type,
    scope, region_id, position, person_id
  );

CREATE TABLE person_metric_counts AS
SELECT
  metric, metric_version, event_set_version, result_type,
  scope, region_id, COUNT(*) AS count
FROM person_metric_scores
GROUP BY metric, metric_version, event_set_version, result_type, scope, region_id;
ALTER TABLE person_metric_counts
  ADD PRIMARY KEY (
    metric, metric_version, event_set_version, result_type, scope, region_id
  );
