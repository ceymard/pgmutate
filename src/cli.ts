#!/usr/bin/env node
// import {bootstrap} from './database'
import {fetchLocalMutations} from './mutation'

async function run() {
  const ms = await fetchLocalMutations()
  for (var m of ms)
    console.log(m.name, m.requires)
}

run().catch(e => console.error(e))
