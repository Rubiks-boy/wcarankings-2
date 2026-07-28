# Projection Architecture Proposal

> Temporary proposal for discussion. This is not yet the permanent schema
> contract. Table names and grains should be finalized before dependent APIs are
> treated as stable.

## Goals

- Build one projection per row grain, not one table per sorting option.
- Keep high-cardinality ordering tables narrow.
- Build downstream statistics from shared facts instead of repeatedly scanning
  raw WCA export tables.
- Preserve the result IDs and component rows needed to explain every statistic.
- Add indexes only for product-supported filtering, ordering, and keyset paging.
- Publish every projection from one export generation atomically.
- Keep names predictable as yearly, weekly, competition, city, cohort, and
  metric features are added.

## Naming convention

Use plural snake-case table names:

```text
{subject}_{time_dimension?}_{qualifier?}_{kind}
```

Kinds have specific meanings:

| Suffix | Meaning |
| --- | --- |
| `_facts` | Reusable normalized rows close to source data |
| `_rankings` | Rows with a displayed rank and deterministic internal position |
| `_scores` | One aggregate score per ranked entity |
| `_values` | Auditable component values contributing to a score |
| `_stats` | Aggregate attributes that may support several sorts |
| `_members` | Child or membership rows belonging to another entity |
| `_counts` | Precomputed totals for a defined leaderboard scope |

Use these column names consistently:

| Concept | Name |
| --- | --- |
| Public tied rank | `rank` or `{scope}_rank` |
| Internal deterministic position | `position` or `{scope}_position` |
| Result mode | `result_type` with `single` or `average` |
| Geographic ranking level | `scope` with `world`, `continent`, or `country` |
| Scope identity | `region_id`, with an empty value for World |
| Source result | `result_id` |
| Projection generation | `generation_id` if generation identity becomes explicit |
| Metric definition version | `metric_version` |
| Product event-set version | `event_set_version` |

`sub_rank` is an existing internal name, but new schemas should prefer
`position`. If existing tables are renamed, perform that change as an explicit
migration rather than exposing either name in the UI.

Do not include `_entries` in new table names. It does not identify a grain or
purpose. Existing `_entries` tables can remain temporarily for compatibility.

## Proposed projection graph

```text
raw WCA export
└── result_facts
    ├── person_event_rankings
    │   ├── person_metric_values
    │   └── person_metric_scores
    ├── result_rankings
    ├── person_year_event_rankings
    ├── result_year_rankings
    ├── person_event_weekly_bests
    │   └── person_event_rank_changes
    ├── competition_stats
    ├── competition_event_stats
    │   └── competition_podium_members
    └── city_event_stats
```

Counts are derived after their corresponding ranking projection:

```text
person_ranking_counts
result_ranking_counts
person_metric_counts
```

## Core fact table

### `result_facts`

Grain:

```text
one row per official WCA result
```

Proposed columns:

```text
result_id
event_id
person_id
person_country_id
person_continent_id
competition_id
competition_country_id
competition_city_name
competition_start_date
competition_end_date
competition_year
competition_week_start
round_type_id
round_rank
is_final_round
format_id
position
best
average
value1
value2
value3
value4
value5
attempt_count
regional_single_record
regional_average_record
```

The current public export v2 omits the five attempt values from `results`.
Until the export exposes them, `value1` through `value5` are nullable
placeholders and `attempt_count` uses `formats.expected_solve_count`. Consumers
must not treat the absent values as failed or unattempted solves.

This should be the only new general-purpose downstream layer that directly
scans raw `results`. Event-aware validity and comparison semantics should be
centralized in this layer or in reusable SQL helpers built immediately above it.

Indexes should initially cover:

```text
PRIMARY KEY (result_id)
(person_id, event_id, competition_start_date, result_id)
(competition_id, event_id, result_id)
(event_id, best, result_id)
(event_id, average, result_id)
(competition_year, event_id, best, result_id)
(competition_year, event_id, average, result_id)
```

Only retain the yearly indexes if benchmarks show that the yearly projections
benefit enough to justify their size.

## Person-event rankings

### `person_event_rankings`

Grain:

```text
person + event + result type
```

Proposed columns:

```text
person_id
event_id
result_type
result_id
result_value
country_id
continent_id
world_rank
world_position
continent_rank
continent_position
country_rank
country_position
previous_world_rank
previous_continent_rank
previous_country_rank
world_rank_delta
continent_rank_delta
country_rank_delta
rank_delta_state
```

Physically splitting this into `person_event_single_rankings` and
`person_event_average_rankings` remains acceptable if benchmarks show a
meaningful storage or query advantage. If split, both tables must retain the
same column vocabulary.

Display names and competition names should normally be joined after paging.

### `person_ranking_counts`

Grain:

```text
event + result type + scope + region
```

Columns:

```text
event_id
result_type
scope
region_id
count
```

## Individual-result rankings

### `result_rankings`

Grain:

```text
official result + result type
```

Proposed columns:

```text
result_id
result_type
event_id
person_id
competition_id
competition_start_date
round_type_id
result_value
country_id
continent_id
world_rank
world_position
continent_rank
continent_position
country_rank
country_position
```

As with person rankings, physical Single and Average tables are acceptable:

```text
single_result_rankings
average_result_rankings
```

Their ordering should be deterministic:

```text
result_value
competition_start_date
competition_id
person_id
result_id
```

### `result_ranking_counts`

Grain:

```text
event + result type + scope + region
```

Columns:

```text
event_id
result_type
scope
region_id
count
```

## Person metrics

### `person_metric_values`

Grain:

```text
metric + metric version + result type + scope + region + person + event
```

Columns:

```text
metric
metric_version
event_set_version
result_type
scope
region_id
person_id
event_id
event_rank
personal_result
reference_result
metric_value
```

Initial metrics:

```text
sum_of_ranks
kinch
```

### `person_metric_scores`

Grain:

```text
metric + metric version + result type + scope + region + person
```

Columns:

```text
metric
metric_version
event_set_version
result_type
scope
region_id
person_id
score
coverage
required_coverage
rank
position
```

Sum of Ranks v1 should require complete coverage of its versioned event set.
Kinch must have an explicit, versioned missing-event and Overall aggregation
policy.

## Time-based rankings

### `person_year_event_rankings`

Grain:

```text
year + person + event + result type
```

This represents each person's best result during a year.

### `result_year_rankings`

Grain:

```text
year + official result + result type
```

This represents every valid result during a year.

### `person_event_weekly_bests`

Grain:

```text
competition week + person + event + result type
```

Columns should include the retained `result_id` and `result_value`.

### `person_event_rank_changes`

Grain:

```text
latest competition week + person + event + result type
```

This stores current and pre-week ranks or deltas for World, continent, and
country scopes. It must reconstruct prior standings after excluding the entire
latest week for every person.

### `record_week_streaks`

Grain:

```text
result type + event + scope + region + record holder
```

This should remain separate from rank changes because record possession and
ranking movement have different semantics.

## Competition and city statistics

### `competition_stats`

Grain:

```text
competition
```

Columns:

```text
competition_id
start_date
latitude
longitude
competitor_count
country_count
event_count
attempt_count
record_count
```

One latitude index supports both northernmost and southernmost scans.

### `competition_event_stats`

Grain:

```text
competition + event
```

Columns:

```text
competition_id
event_id
competitor_count
fastest_single
fastest_single_result_id
fastest_average
fastest_average_result_id
winning_single
winning_single_result_id
winning_average
winning_average_result_id
podium_single_score
podium_average_score
```

Every displayed best or winner must retain its source `result_id`.

### `competition_podium_members`

Grain:

```text
competition + event + result type + podium position
```

Columns:

```text
competition_id
event_id
result_type
podium_position
person_id
result_id
result_value
```

The score belongs in `competition_event_stats`; its three auditable components
belong here.

### `city_event_stats`

Grain:

```text
exact city name + country + event
```

Columns:

```text
city_name
country_id
event_id
fastest_single
fastest_single_result_id
fastest_average
fastest_average_result_id
```

The first version must not merge aliases, metro areas, or identically named
cities in different countries.

## Cohorts and persisted lists

Do not precompute every ranking for every arbitrary cohort or user list.

Store membership separately:

```text
competitor_lists
competitor_list_members
system_cohorts
system_cohort_members
```

Small lists can join membership to global projections at request time. Only
large, frequently used, operator-defined cohorts should be considered for
materialized cohort rankings after measurement.

## Features that should reuse these projections

- Percentiles use displayed rank plus the appropriate count projection.
- Person profiles batch person-event rankings and metric values by `person_id`.
- Competitor comparisons batch the same tables for two to four WCA IDs.
- Hypothetical-result lookup uses ranking indexes and counts; it does not need a
  projection per hypothetical value.
- CSV and JSON exports use the same bounded query definitions as their source
  leaderboards.
- Social previews read the first three rows from an existing ranked projection.
- Offline snapshots and generation-aware caches identify one atomically
  published export generation.

## Publication

Build order:

```text
1. Import raw WCA tables
2. Build result_facts
3. Build independent base rankings and statistics
4. Build metrics and time aggregates from those projections
5. Add browse indexes
6. Calculate counts and validation data
7. Publish the complete generation in one RENAME TABLE statement
8. Remove the previous generation
```

The declarative registry should define:

```js
{
  name,
  dependencies,
  tables,
  build,
  validate,
}
```

It should support dependency ordering, selective backfills, per-projection
timing, row counts, validation, and controlled concurrency.

## Open decisions

Before treating this proposal as final, decide and benchmark:

1. Unified versus physically split Single/Average ranking tables.
2. `position` migration timing for existing `sub_rank` columns.
3. The versioned event sets for Sum of Ranks and Kinch.
4. Kinch Overall and missing-event policy.
5. Whether yearly source indexes justify their storage cost.
6. Whether competition-wide pages need another event-normalized grain.
7. Which system cohorts are large or frequent enough to materialize.
8. Whether explicit `generation_id` columns add value beyond atomic table
   publication and export metadata.

## Related roadmap issues

- #1: Kinch Rankings
- #2: Sum of Ranks
- #4: competitor profiles
- #5: percentile context
- #6: competitor comparisons
- #7 and #11: lists and cohorts
- #9: hypothetical result lookup
- #10: CSV and JSON exports
- #13: result details
- #16: social previews
- #17: competition-wide leaderboards
- #18: all-time result leaderboards
- #19: yearly rankings
- #25: caching and resilience
- #39: weekly deltas and record streaks
- #43: competition, podium, city, and geographic rankings
