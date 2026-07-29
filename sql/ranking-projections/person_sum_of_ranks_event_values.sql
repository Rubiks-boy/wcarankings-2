CREATE TABLE person_sum_of_ranks_event_values AS
WITH regional_bests AS (
  SELECT
    'single' AS result_type,
    result.event_id,
    result.person_id,
    result.person_country_id AS country_id,
    COALESCE(country.continent_id, '') AS continent_id,
    MIN(result.best) AS result_value
  FROM results result
  LEFT JOIN countries country ON country.id = result.person_country_id
  WHERE result.best > 0
    AND result.event_id IN ('333', '222', '444', '555', '666', '777', '333bf', '333fm', '333oh', 'clock', 'minx', 'pyram', 'skewb', 'sq1', '444bf', '555bf', '333mbf')
    AND result.person_country_id <> ''
  GROUP BY result.event_id, result.person_id, result.person_country_id, country.continent_id

  UNION ALL

  SELECT
    'average',
    result.event_id,
    result.person_id,
    result.person_country_id,
    COALESCE(country.continent_id, ''),
    MIN(result.average)
  FROM results result
  LEFT JOIN countries country ON country.id = result.person_country_id
  WHERE result.average > 0
    AND result.event_id IN ('333', '222', '444', '555', '666', '777', '333bf', '333fm', '333oh', 'clock', 'minx', 'pyram', 'skewb', 'sq1', '444bf', '555bf')
    AND result.person_country_id <> ''
  GROUP BY result.event_id, result.person_id, result.person_country_id, country.continent_id
), country_values AS (
  SELECT
    result_type,
    event_id,
    person_id,
    country_id AS region_id,
    result_value,
    RANK() OVER (
      PARTITION BY result_type, event_id, country_id
      ORDER BY result_value
    ) AS event_rank
  FROM regional_bests
), continent_bests AS (
  SELECT
    result_type,
    event_id,
    person_id,
    continent_id,
    MIN(result_value) AS result_value
  FROM regional_bests
  WHERE continent_id <> ''
  GROUP BY result_type, event_id, person_id, continent_id
), continent_values AS (
  SELECT
    result_type,
    event_id,
    person_id,
    continent_id AS region_id,
    result_value,
    RANK() OVER (
      PARTITION BY result_type, event_id, continent_id
      ORDER BY result_value
    ) AS event_rank
  FROM continent_bests
), world_values AS (
  SELECT
    'single' AS result_type,
    event_id,
    person_id,
    best AS result_value,
    world_rank AS event_rank
  FROM ranking_entries_single
  WHERE event_id IN ('333', '222', '444', '555', '666', '777', '333bf', '333fm', '333oh', 'clock', 'minx', 'pyram', 'skewb', 'sq1', '444bf', '555bf', '333mbf')
    AND world_rank > 0

  UNION ALL

  SELECT
    'average',
    event_id,
    person_id,
    best,
    world_rank
  FROM ranking_entries_average
  WHERE event_id IN ('333', '222', '444', '555', '666', '777', '333bf', '333fm', '333oh', 'clock', 'minx', 'pyram', 'skewb', 'sq1', '444bf', '555bf')
    AND world_rank > 0
)
SELECT
  1 AS metric_version,
  1 AS event_set_version,
  result_type,
  'world' AS scope,
  '' AS region_id,
  person_id,
  event_id,
  event_rank,
  result_value
FROM world_values

UNION ALL

SELECT
  1, 1, result_type, 'continent', region_id, person_id, event_id, event_rank,
  result_value
FROM continent_values

UNION ALL

SELECT
  1, 1, result_type, 'country', region_id, person_id, event_id, event_rank,
  result_value
FROM country_values;

ALTER TABLE person_sum_of_ranks_event_values
  ADD PRIMARY KEY (
    metric_version, event_set_version, result_type,
    scope, region_id, person_id, event_id
  );
