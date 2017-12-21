import {db} from './database'
import * as cr from 'crypto'
import * as log from './log'

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
   * Comparison function
   * @param mut1
   * @param mut2
   */
  static compare(mut1: Mutation, mut2: Mutation): 1 | 0 | -1 {
    return mut1.dependsOn(mut2) ? 1 : // mut1 needs to be run after mut2
           mut2.dependsOn(mut1) ? -1 :
           mut1.dependencies.length > mut2.dependencies.length ? 1 :
           mut1.dependencies.length < mut2.dependencies.length ? -1 :
           mut1.name < mut2.name ? 1 :
           mut1.name > mut2.name ? -1 :
           0
  }

  /**
   * A registry where all the mutations are stored. It is sorted by mutation name.
   */
  public registry: Mutation[]
  public dependents: Mutation[] = []

  //////////////////////////////////////

  constructor(
    public name: string,
    public module: string,
    public source: string
  ) {

  }

  @memoize
  get is_static() {
    return !!/^--\s*!static/gm.test(this.source)
  }

  /**
   * True if this mutation needs the provided mutation to be executed
   * before itself.
   */
  dependsOn(mutation: Mutation) {
    return this.dependencies.indexOf(mutation) > -1
  }

  addDependent(mutation: Mutation) {
    this.dependents.push(mutation)
  }

  get full_name() {
    return `${this.module}:${this.name}`
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
    const re_require = /^--\s*!r(?:equires?)?:?\s*(.*)$/im
    const match = re_require.exec(this.source)
    if (!match) return []

    return match[1].split(',').map(n => n.trim())
  }

  matchesRequirement(r: string) {
    return this.name === r ||
      this.full_name === r ||
      this.module === r
  }

  /**
   *  Get the list of mutation we wish to see applied before us.
   */
  @memoize
  get dependencies(): Mutation[] {
    const req = this.requires
    var res: Mutation[] = []

    for (var r of req) {
      var found = false
      for (var mut of this.registry) {
        if (mut.matchesRequirement(r)) {
          // WARNING we should check for circular dependencies.
          res = [...res, ...mut.dependencies, mut]
          mut.addDependent(this)
          found = true
          break
        }
      }
      if (!found)
        log.err(`${this.full_name} requires non existent module ${r}`)
    }

    return res
  }

}



export async function fetchRemoteMutations(): Promise<Mutation[]> {
  return []
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
    if (imports.length) {
      for (var i of imports) {
        m.requires.unshift(i)
      }
    }
  }

  return mutations
}
