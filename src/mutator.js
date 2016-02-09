'use strict'

var path = require('path')
var co = require('co')
var fs = require('mz/fs')
var murmur = require('murmur')
var c = require('colors/safe')

const UP_ARROW = c.green.bold('\u2191') // up arrow
const DOWN_ARROW = c.red.bold('\u2193') // down
const EQUIVALENT = c.cyan.bold('\u2261')
const CHECK = c.cyan.bold('\u2713')


var L = require('./log')

function Mutation(opts) {
	this.filename = opts.filename
	this.module = opts.module
	this.hash = opts.hash
	this.mutation = opts.mutation
	this.timestamp = opts.timestamp
}

Mutation.prototype = {}

Mutation.prototype.report = function () {
	console.log(`  ${EQUIVALENT} ${c.bold(this.filename)}`)
}

/**

type Mutation = {
	filename : String.
	module : String,
	hash : String,
	stamp : String // for schema mutations
}

 */

function Mutator(pth) {
	// Base path that we're going to check
	this.path = pth || process.cwd()
	this.base_module = 'sw-pg-auth'
	this.mutations = null
}

Mutator.prototype = {}

/**
 * Recursively get sql files for a given path.
 * Path is obligatorily a directory
 * @param {[type]} path)         {} [description]
 * @yield {[type]} [description]
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
			sqlfiles.push(yield this.makeMutation(fullpath))
		}
	}

	return sqlfiles
})

/**
 * Create a Mutation object from the given file.
 * @param {[type]} pth)          {} [description]
 * @returns {Mutation} The Mutation object representing this file
 */
Mutator.prototype.makeMutation = co.wrap(function* makeMutation(pth) {

	let filename = path.basename(pth)
	let matches = /^(\d+)_.*$/.exec(filename)
	let mutation = yield fs.readFile(pth, 'utf-8')
	let module = path.join(this.base_module, path.dirname(pth.replace(`${this.path}/`, '')))

	return new Mutation({
		filename: path.basename(pth),
		module: module,
		hash: murmur.hash128(mutation).hex(),
		mutation: mutation,
		timestamp: matches ? matches[1] : ''
	})
})

/**
 * Get the mutations defined at a given path.
 * @param  {String} path The folder that we want to check mutations for.
 * @return {Array<Mutation>} The mutations to be applied.
 */
Mutator.prototype.getMutations = co.wrap(function* getMutations(path) {
	// First, get to the root of the project by looking for its package.json

	var files = yield this.getSqlFiles(this.path)
	this.mutations = files
	this.report()
	// for (let f of files)
	// 	f.report()
	// console.log(files)

	// Then, look for its mutations/ folder, or whatever is defined in the package.json'
	// pgmutate options ?
})

/**
 * Display status of migrations
 * @param  {[type]} opts [description]
 * @return {[type]}      [description]
 */
Mutator.prototype.report = function report(opts) {

	this.mutations = this.mutations.sort((a, b) => {
		if (a.module < b.module) return -1
		if (a.module > b.module) return 1
		if (parseInt(a.timestamp) < parseInt(b.timestamp)) return -1
		if (parseInt(a.timestamp) > parseInt(b.timestamp)) return 1
		if (a.filename < b.filename) return -1
		if (a.filename > b.filename) return 1
		return 0
	})

	let prev_module = ''
	for (let m of this.mutations) {
		if (prev_module !== m.module) {
			console.log(`[${c.yellow.bold(m.module)}]`)
			prev_module = m.module
		}
		m.report()
	}

}

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