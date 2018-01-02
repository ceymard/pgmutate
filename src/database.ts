
import * as pgp from 'pg-promise'
import {Mutation, MutationSet} from './mutation'
import chalk from 'chalk'
const ch = chalk.constructor({level: 3})

const database = pgp()

const url = process.env.DATABASE_URL || 'postgres://user:pass@non_existent_server:5432/database'

export interface Extensions {

}

export const db: pgp.IDatabase<Extensions> = database(url)


export async function query(stmt: string, args?: any): Promise<any> {
  try {
    if (process.env.VERBOSE) {
      console.log(`  ${ch.greenBright('>>')} ${ch.grey(stmt)}`)
    }
    return await db.any(stmt, args)
  } catch (e) {
    console.log(`  ${ch.redBright(e.message)}`)
    console.log(`${ch.grey.bold('On statement:')}\n  ${ch.grey(stmt)}`)
    throw e
  }
}

const schema = `public`
const table = `_dmut_migrations`
const tbl = `"${schema}"."${table}"`

/**
 * Create the table that will hold the mutation log.
 */
export async function bootstrap() {


  const create_sql = `
  begin;
  create schema if not exists ${schema};

  create table if not exists ${tbl} (
    name Text primary key,
    source Text,
    ghost Boolean default false,
    date_applied Timestamp default now()
  );

  create index if not exists pgmutate_date_applied
    on ${tbl} using btree (date_applied);

  comment on column ${tbl}.name
    is 'The fully qualified name of the module';

  comment on column ${tbl}.source
    is 'The contents of the mutation file';

  comment on column ${tbl}.ghost
    is 'True if the mutation was put in database but not applied';

  comment on column ${tbl}.date_applied
    is 'Timestamp of when the mutation was applied to the database';

  commit;
  `

  return await db.query(create_sql)
}


/**
 * Fetch mutations that were already in the database
 */
export async function fetchRemoteMutations(): Promise<MutationSet> {
  const res = await db.query(`select * from ${tbl}`) as any[]

  const muts = res.map(dbval => {
    const [module, name] = dbval.name.split(':')
    return new Mutation(name, module, dbval.source)
  })

  for (var m of muts)
    m.computeRequirement(muts)

  return new MutationSet(muts)
}


export class MutationRunner {

  static down_runner(set = new Set<Mutation>()) {
    return async function (mut: Mutation) {
      if (set.has(mut))
        return
      set.add(mut)

      console.log(ch.grey(`  << ${mut.full_name}`))
      for (var stmt of mut.down_statements)
        await query(stmt)

      await query(`delete from ${tbl} where name = $(full_name)`,
        mut
      )

    }
  }

  static up_runner(set = new Set<Mutation>()) {
    return async function (mut: Mutation) {
      if (set.has(mut)) return
      set.add(mut)

      console.log(ch.greenBright(`  >> ${mut.full_name}`))
      for (var stmt of mut.up_statements)
        await query(stmt)

        await query(`insert into ${tbl}(name, source)
        values ($(full_name), $(source))
        on conflict (name) do update
          set source = $(source), date_applied = current_timestamp`,
        mut
        )

    }
  }

  to_down = new Set<Mutation>()
  to_up = new Set<Mutation>()

  constructor(
    public local: MutationSet,
    public remote: MutationSet
  ) {

  }

  /**
   *
   * @param mutations
   */
  async test(mutations: MutationSet) {
    console.log(`\n--- now testing mutations---\n`)
    var errored = false
    for (var m of mutations) {
      // We do not try testing on pure leaves.
      // if (m.parents.size > 0 && m.children.size === 0)
        // continue

      try {
        // Whenever we get to this point, we can consider that all local mutations
        // are up. As such, we want to track the down mutations that were applied
        // to reapply them, and them only.

        console.log(ch.blueBright.bold(` *** trying to down/up ${m.full_name}`))
        await query('savepoint "dmut-testing"')

        const downed = new MutationSet()
        await m.down(MutationRunner.down_runner(downed))
        const already_up = this.local.diff(downed)
        await m.up(MutationRunner.up_runner(already_up))

      } catch(e) {
        errored = true
      } finally {
        await query('rollback to savepoint "dmut-testing"')
      }
    }
    if (errored) throw new Error(`Mutations had errors, bailing.`)
  }

  async mutate() {
    await query('begin')

    try {
      const remote_to_down = new MutationSet()
      for (let r of this.remote) {
        const l = this.local.get(r.full_name)
        // Schedule a migration to be downed if
        if (
          !l // the corresponding local migration is gone
          || l.hash !== r.hash // the hash changed
        ) {
          if (r.serie && !process.env.FORCE)
            throw new Error(`Series mutations can not change, please write a new one instead. (${r.full_name})`)
          remote_to_down.add(r)
        }
      }

      // Migrations that depend on downed migrations need to be tracked as downed
      // as well, since we're going to re-up them right after.
      const downed = new MutationSet()
      const down = MutationRunner.down_runner(downed)
      for (var mut of remote_to_down) {
        await mut.down(down)
      }

      const local_to_up = new MutationSet()
      // console.log(Array.from(this.local).map(l => l.full_name))
      for (var l of this.local) {
        const r = this.remote.get(l.full_name)
        // Schedule a mutation to be run if
        if (
          //   - it was remote and up to date, but was downed
          downed.get(l.full_name)
          //   - it was remote but not up to date (different hash)
          || r && r.hash !== l.hash
          //   - it was not remote
          || !r
        )
          local_to_up.add(l)
      }

      const already_up = new MutationSet()
      for (let r of this.remote) {
        const l = this.local.get(r.full_name)
        if (l && !downed.has(r))
          already_up.add(l)
      }
      const up = MutationRunner.up_runner(already_up)
      for (var mut of local_to_up) {
        await mut.up(up)
        // Immediately try to down the up statement
      }

      await this.test(local_to_up)
    // Once we're done, we might want to commit...
      // await query('rollback')
      await query('commit')
    } catch (e) {
      await query('rollback')
      console.error(e.message)
    }
  }

}