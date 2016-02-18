'use strict'

const path = require('path')
const co = require('co')
const fs = require('mz/fs')

const cfg = require('./config')
const db = require('./db').db
const Mutation = require('./mutation').Mutation
const mutation = require('./mutation')


function Mutator(pth) {
	// Base path that we're going to check
	this.path = pth || process.cwd()
	this.base_module = '<??>'
	this.mutations = null
}

Mutator.prototype = {}

/**
 * Recursively get sql files for a given mutation path.
 * Path is obligatorily a directory containing migrations.
 * It also is an absolute path.
 */
Mutator.prototype.getSqlFiles = co.wrap(function* getSqlFiles(pth) {

	var files = yield fs.readdir(pth)
	var sqlfiles = []
	for (let f of files) {
		let fullpath = path.join(pth, f)
		let stat = yield fs.stat(fullpath)
		if (stat.isDirectory())
			sqlfiles = sqlfiles.concat(yield this.getSqlFiles(path.join(pth, f)))
		else if (f.endsWith('.sql')) {
			sqlfiles.push(yield Mutation.fromFile(fullpath, this.base_module, this.path))
		}
	}

	return sqlfiles
})


Mutator.prototype.getRemoteMutations = co.wrap(function* getRemoteMutations() {

	let res = yield db.query(`
		SELECT * FROM ${cfg.mutation_table} ORDER BY module, name
	`)

	for (let m of res) {
		m = new Mutation(m)
		for (let fm of this.mutations) {
			if (m.key === fm.key) {
				fm.merge(m)
			}
		}
	}
	// console.log(res)

})


/**
 * Get the mutations defined at a given path.
 * @param  {String} path The folder that we want to check mutations for.
 * @return {Array<Mutation>} The mutations to be applied.
 */
Mutator.prototype.getFileMutations = co.wrap(function* getMutations(pth, module) {

	// First, get to the root of the project by looking for its package.json

	while (pth !== '/') {
		if (yield fs.exists(path.join(pth, 'package.json')))
			break
		pth = path.dirname(pth)
	}

	let pkg = JSON.parse(yield fs.readFile(path.join(pth, 'package.json'), 'utf-8'))
	this.base_module = pkg.name

	// FIXME scan sub modules in node_modules to look for those that could have mutations

	this.path = path.join(pth, 'mutations') // FIXME scan configuration

	var files = yield this.getSqlFiles(this.path)

	// FIXME : should declare something in the package.json instead of scanning it all.
	// try {
	// 	var submodules = yield fs.readdir(path.join(pth, 'node_modules'))
	// 	for (let m of submodules) {
	// 		let module_path = path.join(pth, 'node_modules', m)
	// 		var more = yield this.getFileMutations(module_path)
	// 		files = files.concat(more)
	// 	}
	// } catch (e) {
	// 	// console.error(e.stack)
	// }

	if (module)
		files = files.filter(mut => mut.module === module || mut.module.startsWith(module + '/'))

	this.mutations = files

	return files

})

/**
 * [* description]
 */
Mutator.prototype.getAllMutations = co.wrap(function* () {

	yield this.getFileMutations(process.cwd())
	yield this.getRemoteMutations()

	if (cfg.module)
		this.mutations = this.mutations.filter(mut => mut.module.startsWith(cfg.module + '/') || mut.module === cfg.module)

	this.mutations = this.mutations.sort((a, b) => {
		if (parseInt(a.timestamp) < parseInt(b.timestamp)) return -1
		if (parseInt(a.timestamp) > parseInt(b.timestamp)) return 1
		if (a.module < b.module) return -1
		if (a.module > b.module) return 1
		if (a.name < b.name) return -1
		if (a.name > b.name) return 1
		return 0
	})

})

/**
 * Display status of migrations
 * @param  {[type]} opts [description]
 * @return {[type]}      [description]
 */
Mutator.prototype.status = co.wrap(function* status(opts) {

	// let prev_module = ''
	for (let m of this.mutations) {
		if (cfg.all || m.status === mutation.STATUS_CODE_HASH || m.status === mutation.STATUS_UNAPPLIED)
			m.report()
	}

})

/**
 * Find the nearest package.json
 * @param  {[type]} path [description]
 * @return {[type]}      [description]
 */
Mutator.prototype.getProjectName = co.wrap(function* getProjectName(path) {

})

Mutator.prototype.getModuleName = co.wrap(function* getModuleName(path) {

})

/**
 * Get all the database mutations we'll have to compare against.
 * @param {[type]} )             {} [description]
 * @yield {[type]} [description]
 */
Mutator.prototype.getDatabaseMutations = co.wrap(function* getDatabaseMutations() {

})

module.exports = Mutator