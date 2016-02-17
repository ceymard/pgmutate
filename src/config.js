
const cfg = {
	table: 'mutations',
	schema: 'public',
	url: process.env.DATABASE_URL,
	command: process.argv[2] || 'status'
}

cfg.mutation_table = `"${cfg.schema}"."${cfg.table}"`

module.exports = cfg
