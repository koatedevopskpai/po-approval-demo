const cds = require('@sap/cds');

/**
 * Custom bootstrap: ensures the (SQLite) database schema and seed data exist
 * before the server starts.
 *
 * CAP only auto-deploys the database in dev mode with an in-memory database.
 * This demo runs on SQLite in production too (see README), so we deploy
 * idempotently here. With HANA Cloud you would deploy via HDI instead and
 * this block is skipped (db kind is no longer sqlite).
 */
module.exports = async function (options) {
  if (!options.in_memory && cds.env.requires?.db?.kind === 'sqlite') {
    const csn = await cds.load('*');
    const db = await cds.connect.to('db');
    await cds.deploy(csn).to(db);
  }
  return cds.server(options);
};