
import ch from 'chalk'

export var ERRORS = [] as string[]

export function err(msg: string) {
  ERRORS.push(msg)
  console.log(ch.redBright.bold(' error:'), msg)
}
