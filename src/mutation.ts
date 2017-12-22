import * as cr from 'crypto'
import ch from 'chalk'

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

  /**
   * A registry where all the mutations are stored. It is sorted by mutation name.
   */
  public registry: Mutation[]
  public dependents: Mutation[] = []
  public serie: number | null = null
  public errors: string[] = []

  tagged_up = false
  tagged_down = false

  tagDown() {
    for (var _ of this.dependents)
      _.tagDown()
    this.tagged_down = true
  }

  tagUp() {
    // console.log(`tagging ${this.full_name} up !`)
    // console.log(this.dependents.map(d => d.full_name))

    for (var _ of this.dependents)
      _.tagUp()
    this.tagged_up = true
  }

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

  @memoize
  get is_static() {
    return this.serie !== null
  }

  @memoize
  get descendants(): Mutation[] {
    var res = [this] as Mutation[]
    for (var d of this.dependents)
      res = [...res, ...d.descendants]

    if (res.length > 1)
      console.log(`${ch.greenBright(this.full_name)} triggers ${res.slice(1).map(r => r.full_name).join(', ')}`)
    else
      console.log(`${ch.greenBright(this.full_name)} triggers nothing`)
    return res
  }

  addDependent(mutation: Mutation) {
    this.dependents.push(mutation)
  }

  get full_name() {
    return `${this.module}:${this.name}${this.serie != null ? '.' + this.serie : ''}`
  }

  @memoize
  /**
   * A hash that serves to be compared against a previously stored version
   * of the mutation.
   */
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

  @memoize
  /**
   * Get all the down statements, in reverse order, ready to be applied.
   */
  get down(): string[] {
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
  get up(): string[] {
    return this.source
      .replace(/\s*--(?!\s*!).*?$/gm, '')
      // we are not handling recursive comments, and we don't care.
      .replace(/\/\*((?!\*\/)(?:.|\r|\n))*?\*\//mg, '')
      .split(re_split)
      .filter(s => (s||'').trim() !== '')
      .map(s => s.trim())
  }

  @memoize
  /**
   * Get the list of required names.
   */
  get requires(): string[] {
    const res = [] as string[]

    if (this.serie && this.serie > 1)
      res.push(`${this.name}.${this.serie - 1}`)

    const re_require = /^--\s*!r(?:equires?)?:?\s*(.*)$/im
    const match = re_require.exec(this.source)
    if (!match) return res

    return [...res, ...match[1].split(',').map(n => {
      var res = n.trim()

      return res
    })]
  }

  dependsOn(m: Mutation, r: string) {
    const re_req = /(?:([^:]+):)?([^\.]+)(?:\.(\d+))?/
    const match = re_req.exec(r)
    if (!match) {
      this.errors.push(`${r} is not a valid requirement`)
      return
    }

    const module: string = match[1] || this.module
    const name: string = match[2]
    const serie: number | null = match[3] !== undefined ? parseInt(match[3]) : null

    // Modules are required directly
    if (r === m.module) return true
    if (m.module !== module) return false

    if (m.name !== name && m.name.indexOf(`${name}/`) !== 0) return false
    if (serie != null && m.serie !== serie) return false

    if (this.serie != null && m.serie == null)
      this.errors.push(`serial migrations cannot depend on non-serial ones (caused by ${m.full_name})`)

    return true
  }


}


export class MutationRegistry {

  names: {[name: string]: Mutation} = {}
  mutations = new Set<Mutation>()
  protected initial: Set<Mutation>

  constructor(mutations: Mutation[]) {
    this.initial = new Set(mutations)
    for (var m of this.initial) {
      this.names[m.full_name] = m
      this.computeDependency(m)
    }
  }

  get(full_name: string): Mutation | undefined {
    return this.names[full_name]
  }

  /**
   *  Get the list of mutation we wish to see applied before us.
   */
  computeDependency(m: Mutation) {
    const req = m.requires

    if (this.mutations.has(m)) return

    for (var r of req) {
      var found = false
      for (var mut of this.initial) {
        if (mut === m) continue

        if (m.dependsOn(mut, r)) {
          // WARNING we should check for circular dependencies.
          this.computeDependency(mut)
          // mut.addDependent(m)
          found = true
        }
      }

      // We stil want to check that this dependency exists
      // if (found) continue

      for (var dep of this.mutations) {
        if (m.dependsOn(dep, r)) {
          dep.addDependent(m)
          found = true
          break
        }
      }

      if (found) continue
      m.errors.push(`${m.full_name} requires non existent module ${r}`)
    }

    this.mutations.add(m)
    this.initial.delete(m)
  }
}



import {getInfos, getScripts} from './utils'
import {dirname} from 'path'
export async function fetchLocalMutations(path?: string): Promise<Mutation[]> {
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
