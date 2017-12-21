#!/usr/bin/env node
// import {bootstrap} from './database'
import {fetchLocalMutations, Mutation} from './mutation'
import ch from 'chalk'

async function run() {
  const ms = await fetchLocalMutations()
  for (m of ms) { m.registry = ms }
  ms.sort(Mutation.compare)
  for (var m of ms) {
    console.log(
      ch.greenBright(m.hash.slice(0, 6)),
      m.is_static ? ch.bold.yellowBright('[S] ' + m.full_name) : ch.yellowBright(m.full_name),
      m.requires.length > 0 ? '< ' + m.requires.join(', ') : ''
    )
    for (var u of m.down) {
      console.log('-->', ch.grey(u))
    }
    // console.log(m.instructions)
  }
}

run().catch(e => console.error(e))
