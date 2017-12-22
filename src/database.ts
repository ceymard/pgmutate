
import * as pgp from 'pg-promise'
import {Mutation} from './mutation'
const database = pgp()

const url = process.env.DATABASE_URL || 'postgres://user:pass@non_existent_server:5432/database'

export interface Extensions {

}

export const db: pgp.IDatabase<Extensions> = database(url)

export function select(parts: TemplateStringsArray, ...args: any[]): any[] {
  return []
}

const schema = `public`
const table = `_dmut_migrations`
const tbl = `"${schema}"."${table}"`

/**
 * Create the table that will hold the mutation log.
 */
export async function bootstrap() {


  const create_sql = `create schema if not exists ${schema};

  create table if not exists ${schema}${tbl} (
    name Text,
    serie Integer,
    module Text,
    source Text,
    ghost Boolean default false,
    date_applied Timestamp default now()
  );

  create unique index if not exists pgmutate_mutation_name
    on ${tbl} using btree (timestamp, module, name);

  create index if not exists pgmutate_date_applied
    on ${tbl} using btree (date_applied);

  comment on column ${tbl}.module
    is 'The fully qualified name of the module';

  comment on column ${tbl}.source
    is 'The contents of the mutation file';

  comment on column ${tbl}.ghost
    is 'True if the mutation was put in database but not applied';

  comment on column ${tbl}.date_applied
    is 'Timestamp of when the mutation was applied to the database';
  `

  return await db.query(create_sql)
}

export async function fetchRemoteMutations(): Promise<Mutation[]> {
  const res = await db.query(`select * from mutations`) as any[]

  return res.map(dbval => new Mutation(dbval.name, dbval.module, dbval.source))
}