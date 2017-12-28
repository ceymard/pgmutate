#!/usr/bin/env node
// import {bootstrap} from './database'
import {fetchLocalMutations, Mutation} from './mutation'
import {bootstrap, MutationRunner, fetchRemoteMutations} from './database'
import ch from 'chalk'
import * as log from './log'

async function run() {
  const local = await fetchLocalMutations()
  for (var m of local) m.computeRequirement(local)
  var error = false

  const print = Mutation.once(m => {
    console.log(
      `${ch.yellowBright(m.module)}:${ch.redBright(m.name)}${m.serie ? ch.greenBright('.' + m.serie) : ''}`,
    )

    for (var p of m.parents)
      console.log(ch.grey(`  < ${p.full_name}`))

    for (var e of m.errors) { log.err(e); error = true }
  })

  for (var mut of local) {
    await mut.up(print)
    // console.log(m.instructions)
  }

  if (!error) {
    // const runner = new MutationRunner(local, remotes)
    // await runner.mutate()
  }

  process.exit(0)
}

run().catch(e => console.error(e))
