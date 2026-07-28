CREATE TABLE competition_event_stats AS
WITH ordered AS (
  SELECT *,
    ROW_NUMBER() OVER (
      PARTITION BY competition_id, event_id
      ORDER BY best <= 0, best, result_id
    ) AS single_choice,
    ROW_NUMBER() OVER (
      PARTITION BY competition_id, event_id
      ORDER BY average <= 0, average, result_id
    ) AS average_choice
  FROM result_facts
), aggregates AS (
  SELECT
    competition_id, event_id,
    COUNT(DISTINCT person_id) AS competitor_count,
    MIN(NULLIF(best, 0)) AS fastest_single,
    MAX(CASE WHEN single_choice = 1 AND best > 0 THEN result_id END) AS fastest_single_result_id,
    MIN(NULLIF(average, 0)) AS fastest_average,
    MAX(CASE WHEN average_choice = 1 AND average > 0 THEN result_id END) AS fastest_average_result_id,
    MIN(CASE WHEN is_final_round = 1 AND position = 1 THEN NULLIF(best, 0) END) AS winning_single,
    MAX(CASE WHEN is_final_round = 1 AND position = 1 AND best > 0 THEN result_id END) AS winning_single_result_id,
    MIN(CASE WHEN is_final_round = 1 AND position = 1 THEN NULLIF(average, 0) END) AS winning_average,
    MAX(CASE WHEN is_final_round = 1 AND position = 1 AND average > 0 THEN result_id END) AS winning_average_result_id
  FROM ordered
  GROUP BY competition_id, event_id
), podiums AS (
  SELECT
    competition_id, event_id, result_type,
    CASE
      WHEN COUNT(*) = 3
        AND COUNT(DISTINCT podium_position) = 3
        AND COUNT(DISTINCT person_id) = 3
      THEN SUM(result_value)
    END AS podium_score
  FROM competition_podium_members
  GROUP BY competition_id, event_id, result_type
)
SELECT
  aggregate.*,
  single_podium.podium_score AS podium_single_score,
  average_podium.podium_score AS podium_average_score
FROM aggregates aggregate
LEFT JOIN podiums single_podium
  ON single_podium.competition_id = aggregate.competition_id
  AND single_podium.event_id = aggregate.event_id
  AND single_podium.result_type = 'single'
LEFT JOIN podiums average_podium
  ON average_podium.competition_id = aggregate.competition_id
  AND average_podium.event_id = aggregate.event_id
  AND average_podium.result_type = 'average';

ALTER TABLE competition_event_stats
  ADD PRIMARY KEY (competition_id, event_id),
  ADD INDEX idx_competition_event_fastest_single (event_id, fastest_single, competition_id),
  ADD INDEX idx_competition_event_fastest_average (event_id, fastest_average, competition_id),
  ADD INDEX idx_competition_event_podium_single (event_id, podium_single_score, competition_id),
  ADD INDEX idx_competition_event_podium_average (event_id, podium_average_score, competition_id);
