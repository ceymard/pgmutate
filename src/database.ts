
import * as pgp from 'pg-promise'
import {Mutation, MutationRegistry} from './mutation'
import ch from 'chalk'

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
    console.log(`  !!${ch.redBright(stmt)}`)
    console.log(e.message)
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

export async function fetchRemoteMutations(): Promise<Mutation[]> {
  const res = await db.query(`select * from ${tbl}`) as any[]

  return res.map(dbval => {
    const [module, name] = dbval.name.split(':')
    return new Mutation(name, module, dbval.source)
  })
}


export class MutationRunner {

  constructor(
    public local: MutationRegistry,
    public remote: MutationRegistry
  ) {
    // first, compute the list of migrations that will have to be downed
    // console.log(remote.mutations)
    for (var lo of local.mutations) {
      const rm = remote.get(lo.full_name)
      if (!rm) {
        lo.tagUp()
        // Tag this one as an up.
      } else if (rm.hash !== lo.hash) {
        rm.tagDown() // On va downer rm avant de réuper
        lo.tagUp()
      }
    }
  }

  async run(stmts: string[]) {
    for (var s of stmts)
      await query(s)
  }

  async up(m: Mutation) {
    await this.run(m.up)
  }

  async down(m: Mutation) {
    await this.run(m.down)
  }

  async mutate() {
    await query('begin')

    try {
      for (var mut of Array.from(this.remote.mutations).reverse()) {
        if (!mut.tagged_down) continue
        console.log(`« ${mut.full_name}`)
        await this.down(mut)
      }

      const to_up = Array.from(this.local.mutations).filter(m => m.tagged_up)
      for (var mut of to_up) {
        if (!mut.tagged_up) continue

        console.log(`» ${mut.full_name}`)
        // continue

        await this.up(mut)
        // Immediately try to down the up statement

        await query(`insert into ${tbl}(name, source)
        values ($(full_name), $(source))`,
        mut
        )
      }

      var try_to_down = [] as Mutation[]
      for (var u of to_up) {
        for (var d of u.descendants) {
          if (try_to_down.indexOf(d) === -1) try_to_down.push(d)
        }
      }
      try_to_down.reverse()

      const runs = [] as string[]
      try {
        // console.log("  trying to down")
        await query(`savepoint "undoing and redoing"`)
        for (var m of try_to_down) {
          runs.push(`« ${m.full_name}`)
          await this.down(m)
        }
        for (var m of to_up) {
          runs.push(`» ${m.full_name}`)
          await this.up(m)
        }
      } catch(e) {
        console.log(ch.redBright(`  !! error was on test re-run`))
        console.log(ch.gray(`  this would indicate that your down mutation do not really undo or that you are missing some key dependencies in your mutations.`))
        console.log(ch.gray(runs.join('\n')))
        throw e
      } finally {
        await query(`rollback to savepoint "undoing and redoing"`)
      }

    // Once we're done, we might want to commit...
      await query('commit')
    } catch (e) {
      await query('rollback')
    }
  }

}