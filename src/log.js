
var c = require('colors/safe')


function Log() {

}

Log.prototype = {

	notice(msg) {
		// where level is the coloured version capital letter.
		switch (level) {
			case 'DEBUG5':
			case 'DEBUG4':
			case 'DEBUG3':
			case 'DEBUG2':
			case 'DEBUG1':
				level = c.cyan(`D${level[5]}`)
				break
			case 'LOG':
			case 'INFO':
			case 'NOTICE':
				level = c.cyan(level[0])
				break
			case 'WARNING':
				level = c.yellow.bold(level[0])
				break
			case 'ERROR':
				level = c.red.bold(level[0])
				break
			default:
				level = c.bold(level[0])
		}
		console.log(`  ${level} ${msg}`)
	},

	tell(msg) {
		console.log(`${c.bold('.')} ${c.bold(msg)}`)
	},

	up(module, fname) {
		console.log(`${c.green.bold('+')} ${module}/${c.bold(fname)}`)
	},

	down(module, fname) {
		console.log(`${c.red.bold('-')} ${module}/${c.bold(fname)}`)
	},
}

module.exports = new Log
