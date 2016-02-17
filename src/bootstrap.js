'use strict'

const co = require('co')

const db = require('./db').db
const cfg = require('./config')


/**
 * Bootstraps the database, creating the required tables if need be.
 * It is pretty much run all the time.
 */
var bootstrap = co.wrap(function* bootstrap () {

	let tbl = `"${cfg.schema}"."${cfg.table}"`

	let create_sql = `
		create schema if not exists ${cfg.schema};

		create table if not exists ${tbl} (
			timestamp Timestamp,
			module Text,
			name Text,
			mutation Text,
			description Text,
			hash Text,
			ghost Boolean default false,
			date_applied Timestamp default now()
		);

		create unique index if not exists pgmutate_mutation_name
			on ${tbl} using btree (timestamp, module, name, mutation);

		create index if not exists pgmutate_date_applied
			on ${tbl} using btree (date_applied);

		comment on column ${tbl}.timestamp
			is 'the timestamp part of the mutation file name';

		comment on column ${tbl}.hash
			is 'hash of the file to check for differences';

		comment on column ${tbl}.module
			is 'The fully qualified name of the module';

		comment on column ${tbl}.mutation
			is 'The contents of the mutation file';

		comment on column ${tbl}.ghost
			is 'True if the mutation was put in database but not applied';

		comment on column ${tbl}.date_applied
			is 'Timestamp of when the mutation was applied to the database';
	`

	// Execute the creation of the mutations.
	let res = yield db.query(create_sql)

})

module.exports = bootstrap
