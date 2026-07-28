CREATE TABLE competition_podium_members AS
SELECT
  competition_id, event_id, 'single' AS result_type,
  position AS podium_position, person_id, result_id, best AS result_value
FROM result_facts
WHERE is_final_round = 1 AND position IN (1, 2, 3) AND best > 0
UNION ALL
SELECT
  competition_id, event_id, 'average',
  position, person_id, result_id, average
FROM result_facts
WHERE is_final_round = 1
  AND event_id <> '333mbf'
  AND position IN (1, 2, 3)
  AND average > 0;

ALTER TABLE competition_podium_members
  ADD PRIMARY KEY (competition_id, event_id, result_type, podium_position, result_id),
  ADD INDEX idx_competition_podium_members_person
    (person_id, event_id, result_type, competition_id);
