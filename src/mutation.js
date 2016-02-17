'use strict'

const murmur = require('murmur')
const fs = require('mz/fs')
const path = require('path')
const co = require('co')
const c = require('colors/safe')

const db = require('./db').db
const cfg = require('./config')


const UP_ARROW = c.cyan.bold('\u2191') // up arrow
const DOWN_ARROW = c.red.bold('\u2193') // down
const EQUIVALENT = c.yellow.bold('\u2261')
const CHECK = c.green.bold('\u2713')
const YELLOW_CHECK = c.yellow.bold('\u2713')
const NOT_APPLIED = c.red.bold('?')
const RIGHT_ARROW = c.yellow('\u271a')


// When the mutation is present both on disk and on the
// server and its hash is the same.
const STATUS_APPLIED = 1
// When the mutation is only present on disk
const STATUS_UNAPPLIED = 2
// When the mutation is only present on the server
const STATUS_REMOVED = 3
// Code Mutation present in both, but its hash is different
const STATUS_CODE_HASH = 4
// Schema Mutation present in both, hash different
const STATUS_SCHEMA_HASH = 5

const ST = {
	[STATUS_UNAPPLIED]: NOT_APPLIED,
	[STATUS_CODE_HASH]: EQUIVALENT,
	[STATUS_APPLIED]: CHECK,
	[STATUS_SCHEMA_HASH]: YELLOW_CHECK,
	[STATUS_REMOVED]: DOWN_ARROW
}


/**
 * A single mutation
 * @param {[type]} opts [description]
 */
function Mutation(opts) {
	this.name = opts.name
	this.module = opts.module
	this.hash = opts.hash
	this.mutation = opts.mutation
	this.timestamp = opts.timestamp
	this.remote_mutation = null

	this.status = opts.status

	this.key = `${this.module}/${this.name}`
}

Mutation.prototype = {}

Mutation.prototype.report = function () {
	console.log(`  ${ST[this.status]} ${this.module}/${(this.timestamp ? c.blue.bold : c.magenta.bold)(this.name)}`)
}

Mutation.prototype.merge = function (mut) {
	this.remote_mutation = mut.mutation

	if (mut.hash !== this.hash)
		this.status = this.timestamp ? STATUS_SCHEMA_HASH : STATUS_CODE_HASH
	else
		this.status = STATUS_APPLIED
}

Mutation.prototype.key = function () {
	return `${this.module}/${this.name}`
}

/**
 * Perform an 'up' mutation.
 *
 * @param {Object} opts Options
 */
Mutation.prototype.up = co.wrap(function* up(opts) {

	opts = opts || {}
	let mutation = opts.ghost ? '' : this.mutation

	if (!this.timestamp && this.status !== STATUS_UNAPPLIED)
		yield this.down(opts)

	process.stdout.write(`  ${UP_ARROW} applying ${c.gray.bold(this.module)} ${this.name}`)

	let sql = `DO $pgmutation$
		DECLARE up boolean = true;
		DECLARE down boolean = false;
	BEGIN

		${cfg.ghost ? '' : mutation}

		INSERT INTO ${cfg.mutation_table}
			(name, module, date_applied, ghost, mutation, hash, timestamp)
		VALUES ($1, $2, NOW(), $3, $4, $5, $6);

	END $pgmutation$;`

	try {
		yield db.query(sql, [
			this.name,
			this.module,
			opts.ghost == true,
			this.mutation,
			this.hash,
			this.timestamp ? new Date(parseInt(this.timestamp) * 1000) : null
		])

		console.log(` ${c.green.bold('OK')}`)

	} catch (e) {
		console.log(` ${c.red.bold('FAIL')}`)
		throw e
	}

})

/**
 *
 */
Mutation.prototype.down = co.wrap(function* down() {

	if (this.remote_mutation === null) return

	process.stdout.write(`  ${DOWN_ARROW} de-applying ${c.gray.bold(this.module)} ${this.name}`)

	let sql = `DO $pgmutation$
		DECLARE up boolean = false;
		DECLARE down boolean = true;
	BEGIN

		${cfg.ghost ? '' : this.remote_mutation}

		DELETE FROM ${cfg.mutation_table} WHERE
			"name" = $1 AND "module" = $2;

	END $pgmutation$;`

	try {
		yield db.query(sql, [this.name, this.module])
		console.log(` ${c.green.bold('OK')}`)

	} catch (e) {
		console.log(` ${c.red.bold('FAIL')}`)

		throw e
	}

})

/**
 * Compare a migration to another (generally the same migration
 * coming from the database)
 * @param  {[type]} m [description]
 * @return {[type]}   [description]
 */
Mutation.prototype.compareTo = function (m) {

}


Mutation.fromFile = co.wrap(function* fromFile(pth, base_module, base) {

	let name = path.basename(pth)
	let matches = /^(\d+)_.*$/.exec(name)
	let mutation = yield fs.readFile(pth, 'utf-8')
	let module = path.join(base_module, path.dirname(pth.replace(`${base}/`, '')))

	return new Mutation({
		name: path.basename(pth),
		module: module,
		hash: murmur.hash128(mutation).hex(),
		mutation: mutation,
		timestamp: matches ? matches[1] : '',
		status: STATUS_UNAPPLIED
	})

})


Mutation.fromRecord = function fromRecord(record) {

	return new Mutation({
		name: record.name,
		module: record.module,
		hash: record.hash,
		mutation: record.mutation,
		timestamp: record.timestamp,
		status: STATUS_APPLIED
	})

}

exports.Mutation = Mutation
exports.STATUS_REMOVED = STATUS_REMOVED
exports.STATUS_APPLIED = STATUS_APPLIED
exports.STATUS_UNAPPLIED = STATUS_UNAPPLIED
exports.STATUS_CODE_HASH = STATUS_CODE_HASH
exports.STATUS_SCHEMA_HASH = STATUS_SCHEMA_HASH
