
'use strict'

const cfg = require('./config')


if (!cfg.url)
	throw new Error('DATABASE_URL environment variable not found')

const pgp = require('pg-promise')({ })

const db = pgp(cfg.url)


exports.db = db
exports.pgp = pgp
