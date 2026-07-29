DROP TEMPORARY TABLE IF EXISTS sum_of_ranks_event_penalties;

CREATE TEMPORARY TABLE sum_of_ranks_event_penalties
ENGINE = MEMORY
AS
SELECT
  metric_version,
  event_set_version,
  result_type,
  scope,
  region_id,
  event_id,
  COUNT(*) + 1 AS fallback_rank
FROM person_sum_of_ranks_event_values
GROUP BY
  metric_version,
  event_set_version,
  result_type,
  scope,
  region_id,
  event_id;

ALTER TABLE sum_of_ranks_event_penalties
  ADD PRIMARY KEY (
    metric_version, event_set_version, result_type,
    scope, region_id, event_id
  );

CREATE TABLE person_sum_of_ranks_scores AS
WITH baselines AS (
  SELECT
    metric_version,
    event_set_version,
    result_type,
    scope,
    region_id,
    SUM(fallback_rank)
      + (CASE WHEN result_type = 'single' THEN 17 ELSE 16 END)
      - COUNT(*) AS fallback_score,
    CASE WHEN result_type = 'single' THEN 17 ELSE 16 END AS required_coverage
  FROM sum_of_ranks_event_penalties
  GROUP BY
    metric_version, event_set_version, result_type,
    scope, region_id
), person_adjustments AS (
  SELECT
    value.metric_version,
    value.event_set_version,
    value.result_type,
    value.scope,
    value.region_id,
    value.person_id,
    SUM(
      CAST(value.event_rank AS SIGNED)
        - CAST(penalty.fallback_rank AS SIGNED)
    ) AS score_adjustment,
    COUNT(*) AS coverage
  FROM person_sum_of_ranks_event_values value
  INNER JOIN sum_of_ranks_event_penalties penalty
    ON penalty.metric_version = value.metric_version
    AND penalty.event_set_version = value.event_set_version
    AND penalty.result_type = value.result_type
    AND penalty.scope = value.scope
    AND penalty.region_id = value.region_id
    AND penalty.event_id = value.event_id
  GROUP BY
    value.metric_version,
    value.event_set_version,
    value.result_type,
    value.scope,
    value.region_id,
    value.person_id
), totals AS (
  SELECT
    person.metric_version,
    person.event_set_version,
    person.result_type,
    person.scope,
    person.region_id,
    person.person_id,
    CAST(baseline.fallback_score AS SIGNED)
      + person.score_adjustment AS score,
    person.coverage,
    baseline.required_coverage
  FROM person_adjustments person
  INNER JOIN baselines baseline
    ON baseline.metric_version = person.metric_version
    AND baseline.event_set_version = person.event_set_version
    AND baseline.result_type = person.result_type
    AND baseline.scope = person.scope
    AND baseline.region_id = person.region_id
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
FROM totals;

ALTER TABLE person_sum_of_ranks_scores
  ADD PRIMARY KEY (
    metric_version, event_set_version, result_type,
    scope, region_id, person_id
  ),
  ADD INDEX idx_person_sum_of_ranks_page (
    metric_version, event_set_version, result_type,
    scope, region_id, position, person_id
  );

DROP TEMPORARY TABLE sum_of_ranks_event_penalties;
