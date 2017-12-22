#!/usr/bin/env node
// import {bootstrap} from './database'
import {fetchLocalMutations, MutationRegistry} from './mutation'
import ch from 'chalk'
import * as log from './log'

async function run() {
  const reg = new MutationRegistry(await fetchLocalMutations())

  for (var m of reg.mutations) {
    console.log(
      ch.greenBright(m.hash.slice(0, 6)),
      m.is_static ? ch.bold.yellowBright(m.full_name) : ch.yellowBright(m.full_name),
      ch.grey(m.requires.length > 0 ? m.requires.join(' ') : '')
    )
    for (var e of m.errors) { log.err(e) }
    for (var u of m.down) {
      // console.log('-->', ch.grey(u))
    }
    // console.log(m.instructions)
  }
}

run().catch(e => console.error(e))
