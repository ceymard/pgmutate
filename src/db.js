
'use strict'

const cfg = require('./config')

const pgp = require('pg-promise')({

})
exports.pgp = pgp

if (!cfg.url)
	throw new Error('DATABASE_URL environment variable not found')

const db = pgp(cfg.url)
exports.db = db
