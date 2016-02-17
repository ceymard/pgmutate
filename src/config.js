
const nopt = require('nopt')

var res = nopt({
	down: [String],
	module: [String]
}, {
	a: ['--all'],
	g: ['--ghost'],
	m: ['-m']
})

// console.log(res)

const cfg = {
	table: 'mutations',
	schema: 'public',
	url: process.env.DATABASE_URL,
	command: res.argv.remain[0] || 'status',
	args: res.argv.remain.slice(1),
	all: res.all,
	ghost: res.ghost,
	module: res.module
}

cfg.mutation_table = `"${cfg.schema}"."${cfg.table}"`

module.exports = cfg
