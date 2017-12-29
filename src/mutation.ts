import * as cr from 'crypto'

const re_down = /^--\s*!d(?:own)?\(((?:.|\r|\n)*?)^--\)\s*\n|^--\s*!d(?:own)?:?(.*?)$/gim
const re_split = /^--\s*!.*?$|^--\s*!d(?:own)?\((?:(?:.|\r|\n)*?)^--\)\s*\n/gim


/**
 * Memoize un appel d'un get(). À n'utiliser que sur des properties calculées,
 * pas sur des propriétés d'une classe.
 *
 * @param target The class instance
 * @param key The property name
 * @param descriptor The property descriptor
 */
export function memoize(target: any, key: string, descriptor: PropertyDescriptor) {
	const sym = Symbol(key)
	const orig = descriptor.get!

	descriptor.get = function (this: Object) {
		if (!this.hasOwnProperty(sym)) {
			Object.defineProperty(this, sym, {value: orig.call(this), enumerable: false})
		}
		return (this as any)[sym]
	}

}


export enum MutationStatus {
  UNAPPLIED = 'u',
  APPLIED = 'a',
  REMOVED = 'r',
  UNSYNC = 'u',
}


export class Mutation {

  static once<T extends ((mut: Mutation, ...a: any[]) => any)>(fn: T): T {
    const results = new Map<Mutation, any>()
    return function(mut: Mutation, ...a: any[]) {
      if (results.has(mut))
        return results.get(mut)
      const res = fn(mut, ...a)
      results.set(mut, res)
      return res
    } as T
  }

  /**
   * A registry where all the mutations are stored. It is sorted by mutation name.
   */
  public children = new Set<Mutation>()
  public parents = new Set<Mutation>()

  public serie: number | null = null
  public errors: string[] = []

  //////////////////////////////////////

  constructor(
    public name: string,
    public module: string,
    public source: string
  ) {
    const serie = /(.*?)\.(\d+)$/
    const match = serie.exec(name)
    if (match) {
      this.name = match[1]
      this.serie = parseInt(match[2])
    }
  }

  get full_name() {
    return `${this.module}:${this.name}${this.serie != null ? '.' + this.serie : ''}`
  }

  /**
   * The hash helps us to determine if a mutation has changed or not.
   */
  @memoize
  get hash(): string {
    const hash = cr.createHash('sha256') // this should be enough to avoid collisions

    // we have to be smart about the source and remove only the parts we don't want
    // to compare only the code.
    const amended_src = this.source
      // We remove single line comments, except if they start with a !, as it has meaning to us.
      .replace(/--(?!\s*!).*?$/gm, '')
      // we are not handling recursive comments, and we don't care.
      .replace(/\/\*((?!\*\/)(.|\r|\n))*?\*\//mg, '')
      // whitespace should not affect if our file changed or not.
      .replace(/[\n\r\t\s]/g, ' ')
      .replace(/ +/g, ' ')
    hash.update(amended_src)

    return hash.digest('hex')
  }

  /**
   * Get all the down statements, in reverse order, ready to be applied.
   */
  @memoize
  get down_statements(): string[] {
    var match: RegExpMatchArray | null
    const res = []
    while (match = re_down.exec(this.source)) {
      const code = match[1] || match[2]
      res.push(code.trim())
    }
    res.reverse()
    return res
  }

  @memoize
  get up_statements(): string[] {
    return this.source
      .replace(/\s*--(?!\s*!).*?$/gm, '')
      // we are not handling recursive comments, and we don't care.
      .replace(/\/\*((?!\*\/)(?:.|\r|\n))*?\*\//mg, '')
      .split(re_split)
      .filter(s => (s||'').trim() !== '')
      .map(s => s.trim())
  }

  /**
   * Runs this mutation and its children
   */
  async up(fn: (m: Mutation) => any, visited = new Set<Mutation>(), do_children = true) {
    if (visited.has(this)) return
    visited.add(this)

    for (var parent of this.parents)
      await parent.up(fn, visited, false)

    await fn(this)

    if (do_children)
      for (var chld of this.children)
        await chld.up(fn, visited)
  }

  /**
   * Removes this mutation along with its children
   */
  async down(fn: (m: Mutation) => Promise<any>) {
    // Check that we haven't already been downed by verifying that
    // there is no entry in the mutation table
    for (var chld of this.children)
      await chld.down(fn)

    await fn(this)
  }

  computeRequirement(mutations: Mutation[]) {

    var descriptors = [] as string[]

    if (this.serie && this.serie > 1)
      descriptors.push(`${this.name}.${this.serie - 1}`)

    const re_require = /^--\s*!r(?:equires?)?:?\s*(.*)$/im
    const match = re_require.exec(this.source)
    if (match) {
      descriptors = [...descriptors, ...match[1].split(',').map(r => r.trim())]
    }

    const re_req = /^(?:([^:]+):)?([^\.]+)(?:\.(\d+))?$/

    for (var desc of descriptors) {

      const match = re_req.exec(desc)
      if (!match) {
        this.errors.push(`${desc} is not a valid requirement`)
        return
      }

      const module: string = match[1] || this.module
      const name: string = match[2]
      const serie: number | null = match[3] !== undefined ? parseInt(match[3]) : null

      // Rebuild the requirement regexp
      const re_desc = new RegExp(`^${module}:${name}(?:\\/[^\\.]+?)?${serie ? '\\.' + serie : '(?:\\.\\d+)?'}$`)
      // console.log(re_desc.source)
      let found = false

      for (var m of mutations) {
        if (m === this) continue

        // Modules are required directly
        if (re_desc.test(m.full_name)) {
          if (this.serie != null && m.serie == null)
            this.errors.push(`serial migrations cannot depend on non-serial ones (caused by ${m.full_name})`)

          found = true
          this.parents.add(m)
          m.children.add(this)
        }
      }

      if (!found)
        this.errors.push(`requirement ${desc} doesn't match any mutation`)
    }
  }


}


export class MutationSet extends Set<Mutation> {

  private dct: {[name: string]: Mutation} = {}

  constructor(mutations: Mutation[] = []) {
    super()
    for (var m of mutations) {
      this.add(m)
    }
  }

  add(mut: Mutation) {
    const r = super.add(mut)
    this.dct[mut.full_name] = mut
    return r
  }

  get(name: string): Mutation | undefined {
    return this.dct[name]
  }

  /**
   * Get our own mutations that have changed in the remote
   * set. Used to find out which are the mutations we will have
   * to down.
   *
   * @param set The other set
   */
  diff(set: MutationSet) {
    const res = new Set<Mutation>()
    for (var m of this) {
      var s = set.get(m.full_name)
      if (!s || m.hash !== s.hash)
        res.add(m)
    }
    return res
  }

  intersect(set: MutationSet) {
    const res = new Set<Mutation>()
    for (var m of this) {
      var s = set.get(m.full_name)
      if (s && m.hash !== s.hash)
        res.add(m)
    }
    return res
  }

}



import {getInfos, getScripts} from './utils'
import {dirname} from 'path'
async function fetchLocal(path?: string): Promise<Mutation[]> {
  path = path || process.cwd()
  const infos = await getInfos(path)
  const name = infos.name
  var imports = [] as string[]

  var mutations = [] as Mutation[]
  if (infos.dmut && infos.dmut.import) {
    imports = infos.dmut.import
    for (var i of imports) {
      mutations = [...(await fetchLocalMutations(
        dirname(require.resolve(i)))
      ), ...mutations]
    }
  }

  for (var s of await getScripts(infos.path)) {
    var m = new Mutation(s.name, name, s.source)
    mutations.push(m)
  }

  return mutations
}


export async function fetchLocalMutations(path?: string): Promise<MutationSet> {
  const mutations = await fetchLocal(path)
  for (var m of mutations)
    m.computeRequirement(mutations)
  return new MutationSet(mutations)
}