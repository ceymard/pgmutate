import {db} from './database'

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
           0
  }

  /**
   * A registry where all the mutations are stored. It is sorted by mutation name.
   */
  static registry: Mutation[]

  //////////////////////////////////////

  constructor(
    public name: string,
    public source: string,
  ) {

  }

  /**
   * True if this mutation needs the provided mutation to be executed
   * before itself.
   */
  dependsOn(mutation: Mutation) {
    return this.dependencies.indexOf(mutation) > -1
  }

  @memoize
  /**
   * A hash that serves to be compared against a previously stored version
   * of the mutation.
   */
  get hash(): string {
    return ''
  }

  @memoize
  /**
   * Get the list of required names.
   */
  get requires(): string[] {
    const re_require = /^--\s*require:\s*(.*)$/im
    const match = re_require.exec(this.source)
    if (!match) return []

    return match[1].split(',').map(n => n.trim())
  }

  @memoize
  /**
   * Get all the down statements, in reverse order, ready to be applied.
   */
  get down(): string[] {
    const re_down = /(?:^--\s*d(?:own)?:(.*?)$|^--\s*d(?:own)?\(\s*$(.*?)^--\)\s*$)/gim
    var match: RegExpMatchArray | null
    const res = []
    while (match = re_down.exec(this.source)) {
      const code = match[1] || match[2]
      res.push(code)
    }
    res.reverse()
    return []
  }

  /**
   *  Get the list of mutation we wish to see applied before us.
   */
  @memoize
  get dependencies(): Mutation[] {
    const req = this.requires
    var res: Mutation[] = []

    for (var mut of Mutation.registry) {
      for (var r of req) {
        if (mut.name === r) {
          // WARNING we should check for circular dependencies.
          res = [...res, ...mut.dependencies, mut]
        }
      }
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
      mutations = [...(await fetchLocalMutations(dirname(require.resolve(i)))), ...mutations]
    }
  }

  for (var s of await getScripts(infos.path)) {
    var m = new Mutation(`${name}${s.name}`, s.source)
    mutations.push(m)
    if (imports.length) {
      for (var i of imports) {
        m.requires.unshift(i)
      }
    }
  }

  return mutations
}
