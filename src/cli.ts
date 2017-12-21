#!/usr/bin/env node
// import {bootstrap} from './database'
import {fetchLocalMutations, Mutation} from './mutation'

async function run() {
  const ms = await fetchLocalMutations()
  for (m of ms) { m.registry = ms }
  ms.sort(Mutation.compare)
  for (var m of ms) {
    console.log(m.full_name, m.hash, m.requires)
    // console.log(m.instructions)
  }
}

run().catch(e => console.error(e))
