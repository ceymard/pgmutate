
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

      console.log(ch.grey(`  « ${mut.full_name}`))
      for (var stmt of mut.down_statements)
        await query(stmt)
    }
  }

  static up_runner(set = new Set<Mutation>()) {
    return async function (mut: Mutation) {
      if (set.has(mut)) return
      set.add(mut)

      console.log(ch.greenBright(`  » ${mut.full_name}`))
      for (var stmt of mut.up_statements)
        await query(stmt)
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
  async test() {
    console.log(`\n--- now testing mutations---\n`)
    var errored = false
    for (var m of this.local) {
      try {

        // We do not try testing on pure leaves.
        if (m.parents.size > 0 && m.children.size === 0)
          continue

        console.log(ch.blueBright.bold(` *** trying to down/up ${m.full_name}`))
        await query('savepoint "dmut-testing"')

        await m.down(MutationRunner.down_runner())
        await m.up(MutationRunner.up_runner())

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
    const remote_to_down = this.remote.diff(this.local)
    const local_to_up = this.local.diff(this.remote)

    try {
      const down = MutationRunner.down_runner(remote_to_down)
      for (var mut of remote_to_down) {
        await mut.down(down)
      }

      const already_up = this.local.intersect(this.remote)
      const up = MutationRunner.up_runner(already_up)
      for (var mut of local_to_up) {
        await mut.up(up)
        // Immediately try to down the up statement

        await query(`insert into ${tbl}(name, source)
        values ($(full_name), $(source))`,
        mut
        )
      }

      await this.test()
    // Once we're done, we might want to commit...
      await query('rollback')
      // await query('commit')
    } catch (e) {
      await query('rollback')
    }
  }

}