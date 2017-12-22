#!/usr/bin/env node
// import {bootstrap} from './database'
import {fetchLocalMutations, MutationRegistry} from './mutation'
import {bootstrap, MutationRunner, fetchRemoteMutations} from './database'
import ch from 'chalk'
import * as log from './log'

async function run() {
  const reg = new MutationRegistry(await fetchLocalMutations())
  var error = false

  await bootstrap()
  const rem = new MutationRegistry(await fetchRemoteMutations())

  for (var m of reg.mutations) {
    console.log(
      ch.greenBright(m.hash.slice(0, 6)),
      m.is_static ? ch.bold.yellowBright(m.full_name) : ch.yellowBright(m.full_name),
      ch.grey(m.requires.length > 0 ? m.requires.join(' ') : '')
    )
    for (var e of m.errors) { log.err(e); error = true }
    // console.log(m.instructions)
  }

  if (!error) {
    const runner = new MutationRunner(reg, rem)
    await runner.mutate()
  }

  process.exit(0)
}

run().catch(e => console.error(e))
