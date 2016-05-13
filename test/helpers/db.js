import r from '../../db/connect'

async function truncateDBTables() {
  return r.tableList()
    .then(tables => tables.filter(t => !t.startsWith('_')))
    .then(tablesToTruncate => Promise.all(tablesToTruncate.map(t => r.table(t).delete().run())))
}

/* eslint-env mocha */
export function withDBCleanup() {
  beforeEach(truncateDBTables)
}

