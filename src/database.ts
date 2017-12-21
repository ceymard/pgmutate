
import * as pgp from 'pg-promise'
const database = pgp()

const url = process.env.DATABASE_URL
if (!url)
  throw new Error(`pgmutate needs the $DATABASE_URL to be set`)

export interface Extensions {

}

export const db: pgp.IDatabase<Extensions> = database(url)


/**
 * Create the table that will hold the mutation log.
 */
export async function bootstrap() {

  const schema = `public`
  const tbl = `_dmut_migrations`

  const create_sql = `create schema if not exists ${schema};

  create table if not exists ${tbl} (
    timestamp Timestamp,
    module Text,
    name Text,
    mutation Text,
    description Text,
    hash Text,
    ghost Boolean default false,
    date_applied Timestamp default now()
  );

  create unique index if not exists pgmutate_mutation_name
    on ${tbl} using btree (timestamp, module, name);

  create index if not exists pgmutate_date_applied
    on ${tbl} using btree (date_applied);

  comment on column ${tbl}.timestamp
    is 'the timestamp part of the mutation file name';

  comment on column ${tbl}.hash
    is 'hash of the file to check for differences';

  comment on column ${tbl}.module
    is 'The fully qualified name of the module';

  comment on column ${tbl}.mutation
    is 'The contents of the mutation file';

  comment on column ${tbl}.ghost
    is 'True if the mutation was put in database but not applied';

  comment on column ${tbl}.date_applied
    is 'Timestamp of when the mutation was applied to the database';
  `

  return await db.query(create_sql)
}
