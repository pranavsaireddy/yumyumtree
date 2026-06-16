'use strict';

const boss = require('./boss');

// Dead-letter visibility (architecture §9 "Dead-letter queue"). A later admin session (S19)
// renders these failed-job counts on the System Health card with a Retry button.
//
// VERSION CHOICE (pg-boss v12.19.1): there is NO boss API that returns failed-job counts.
// getQueueStats() exposes only deferred/queued/active/total — never the failed state. So we
// read the pgboss schema directly through boss.getDb().executeSql(). Failed jobs carry
// state = 'failed' in pgboss.job until archived. 'pgboss' is pg-boss's DEFAULT_SCHEMA and the
// constructor was given no schema override, so the qualified table name is stable.
async function getFailedCounts() {
  const db = boss.getDb();
  const { rows } = await db.executeSql(
    `SELECT name, count(*)::int AS failed_count
       FROM pgboss.job
      WHERE state = 'failed'
      GROUP BY name
      ORDER BY name`
  );
  return rows;
}

module.exports = { getFailedCounts };
