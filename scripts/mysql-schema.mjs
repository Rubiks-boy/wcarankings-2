const INDEXES = [
  ["persons", "idx_persons_wca_sub", "(`wca_id`, `sub_id`)", "wca_id,sub_id"],
  ["persons", "idx_persons_name", "(`name`)", "name"],
  ["ranks_single", "idx_ranks_single_world", "(`event_id`, `world_rank`, `person_id`)", "event_id,world_rank,person_id"],
  ["ranks_single", "idx_ranks_single_continent", "(`event_id`, `continent_rank`, `person_id`)", "event_id,continent_rank,person_id"],
  ["ranks_single", "idx_ranks_single_country", "(`event_id`, `country_rank`, `person_id`)", "event_id,country_rank,person_id"],
  ["ranks_average", "idx_ranks_average_world", "(`event_id`, `world_rank`, `person_id`)", "event_id,world_rank,person_id"],
  ["ranks_average", "idx_ranks_average_continent", "(`event_id`, `continent_rank`, `person_id`)", "event_id,continent_rank,person_id"],
  ["ranks_average", "idx_ranks_average_country", "(`event_id`, `country_rank`, `person_id`)", "event_id,country_rank,person_id"],
  ["results", "idx_results_single_best", "(`person_id`, `event_id`, `best`, `id`)", "person_id,event_id,best,id"],
  ["results", "idx_results_average_best", "(`person_id`, `event_id`, `average`, `id`)", "person_id,event_id,average,id"],
];

const PROJECTION_INDEXES = [
  ["idx_ranking_entries_world", "(`event_id`, `ranking_type`, `world_sub_rank`, `person_id`)"],
  ["idx_ranking_entries_continent", "(`event_id`, `ranking_type`, `continent_id`, `continent_sub_rank`, `person_id`)"],
  ["idx_ranking_entries_country", "(`event_id`, `ranking_type`, `country_id`, `country_sub_rank`, `person_id`)"],
  ["idx_ranking_entries_person", "(`person_id`, `event_id`, `ranking_type`)"],
];

const VIEW_STATEMENTS = [
  `CREATE OR REPLACE VIEW wca_best_single AS
   SELECT
     person_id,
     event_id,
     CAST(SUBSTRING_INDEX(GROUP_CONCAT(best ORDER BY best, id), ',', 1) AS UNSIGNED) AS best,
     SUBSTRING_INDEX(GROUP_CONCAT(competition_id ORDER BY best, id), ',', 1) AS competition_id
   FROM results
   WHERE best > 0
   GROUP BY person_id, event_id`,
  `CREATE OR REPLACE VIEW wca_best_average AS
   SELECT
     person_id,
     event_id,
     CAST(SUBSTRING_INDEX(GROUP_CONCAT(average ORDER BY average, id), ',', 1) AS UNSIGNED) AS best,
     SUBSTRING_INDEX(GROUP_CONCAT(competition_id ORDER BY average, id), ',', 1) AS competition_id
   FROM results
   WHERE average > 0
   GROUP BY person_id, event_id`,
  `CREATE OR REPLACE VIEW ranking_entries_source AS
   SELECT
     r.event_id,
     'single' AS ranking_type,
     r.person_id,
     COALESCE(p.name, r.person_id) AS person_name,
     COALESCE(p.country_id, '') AS country_id,
     COALESCE(c.name, p.country_id, '') AS country_name,
     COALESCE(c.iso2, '') AS country_iso2,
     COALESCE(c.continent_id, '') AS continent_id,
     r.best,
     COALESCE(b.competition_id, '') AS competition_id,
     COALESCE(comp.name, '') AS competition_name,
     r.world_rank,
     r.continent_rank,
     r.country_rank,
     ROW_NUMBER() OVER (
       PARTITION BY r.event_id
       ORDER BY r.world_rank, COALESCE(p.name, r.person_id), r.person_id
     ) AS world_sub_rank,
     ROW_NUMBER() OVER (
       PARTITION BY r.event_id, COALESCE(c.continent_id, '')
       ORDER BY r.continent_rank, COALESCE(p.name, r.person_id), r.person_id
     ) AS continent_sub_rank,
     ROW_NUMBER() OVER (
       PARTITION BY r.event_id, COALESCE(p.country_id, '')
       ORDER BY r.country_rank, COALESCE(p.name, r.person_id), r.person_id
     ) AS country_sub_rank
   FROM ranks_single r
   LEFT JOIN persons p ON p.wca_id = r.person_id AND p.sub_id = 1
   LEFT JOIN countries c ON c.id = p.country_id
   LEFT JOIN wca_best_single b ON b.person_id = r.person_id AND b.event_id = r.event_id
   LEFT JOIN competitions comp ON comp.id = b.competition_id
   UNION ALL
   SELECT
     r.event_id,
     'average' AS ranking_type,
     r.person_id,
     COALESCE(p.name, r.person_id) AS person_name,
     COALESCE(p.country_id, '') AS country_id,
     COALESCE(c.name, p.country_id, '') AS country_name,
     COALESCE(c.iso2, '') AS country_iso2,
     COALESCE(c.continent_id, '') AS continent_id,
     r.best,
     COALESCE(b.competition_id, '') AS competition_id,
     COALESCE(comp.name, '') AS competition_name,
     r.world_rank,
     r.continent_rank,
     r.country_rank,
     ROW_NUMBER() OVER (
       PARTITION BY r.event_id
       ORDER BY r.world_rank, COALESCE(p.name, r.person_id), r.person_id
     ) AS world_sub_rank,
     ROW_NUMBER() OVER (
       PARTITION BY r.event_id, COALESCE(c.continent_id, '')
       ORDER BY r.continent_rank, COALESCE(p.name, r.person_id), r.person_id
     ) AS continent_sub_rank,
     ROW_NUMBER() OVER (
       PARTITION BY r.event_id, COALESCE(p.country_id, '')
       ORDER BY r.country_rank, COALESCE(p.name, r.person_id), r.person_id
     ) AS country_sub_rank
   FROM ranks_average r
   LEFT JOIN persons p ON p.wca_id = r.person_id AND p.sub_id = 1
   LEFT JOIN countries c ON c.id = p.country_id
   LEFT JOIN wca_best_average b ON b.person_id = r.person_id AND b.event_id = r.event_id
   LEFT JOIN competitions comp ON comp.id = b.competition_id`,
];

export async function dropManagedObject(connection, name) {
  const [rows] = await connection.query(
    "SELECT TABLE_TYPE AS type FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ? LIMIT 1",
    [name],
  );
  if (rows[0]?.type === "VIEW") await connection.query(`DROP VIEW \`${name}\``);
  if (rows[0]?.type === "BASE TABLE") await connection.query(`DROP TABLE \`${name}\``);
}

export async function refreshMysqlSchema(connection) {
  for (const name of ["ranking_counts", "ranking_entries", "ranking_counts_source", "ranking_entries_source", "wca_best_single", "wca_best_average"]) {
    await dropManagedObject(connection, name);
  }

  for (const [table, name, columns, columnList] of INDEXES) {
    if (table === "results" && process.env.WCA_SKIP_LARGE_INDEXES === "1") {
      process.stdout.write(`Skipping large results index ${name} in constrained mode\n`);
      continue;
    }
    const [existing] = await connection.query(
      "SELECT 1 FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = ? AND index_name = ? LIMIT 1",
      [table, name],
    );
    if (existing.length === 0) {
      await connection.query(`ALTER TABLE \`${table}\` ADD INDEX \`${name}\` ${columns}`);
      process.stdout.write(`Added ${table}.${name} (${columnList})\n`);
    }
  }

  for (const statement of VIEW_STATEMENTS) await connection.query(statement);

  await connection.query("CREATE TABLE ranking_entries AS SELECT * FROM ranking_entries_source");
  for (const [name, columns] of PROJECTION_INDEXES) {
    await connection.query(`ALTER TABLE ranking_entries ADD INDEX \`${name}\` ${columns}`);
  }
  await connection.query(`
    CREATE TABLE ranking_counts AS
    SELECT event_id, ranking_type, 'world' AS scope, '' AS region_id, COUNT(*) AS count
    FROM ranking_entries
    GROUP BY event_id, ranking_type
    UNION ALL
    SELECT event_id, ranking_type, 'continent' AS scope, continent_id AS region_id, COUNT(*) AS count
    FROM ranking_entries
    GROUP BY event_id, ranking_type, continent_id
    UNION ALL
    SELECT event_id, ranking_type, 'country' AS scope, country_id AS region_id, COUNT(*) AS count
    FROM ranking_entries
    GROUP BY event_id, ranking_type, country_id
  `);
  await connection.query("ALTER TABLE ranking_counts ADD PRIMARY KEY (event_id, ranking_type, scope, region_id)");
}
