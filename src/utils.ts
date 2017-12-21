import * as pth from 'path'

import * as fs from 'fs-extra'

export interface Info {
  name: string
  path: string
  version: string
  dmut?: {
    import?: string[]
  }
}

export async function getInfos(dir?: string): Promise<Info> {
  dir = dir || process.cwd()
  while (dir !== '/') {
    if (await fs.existsSync(pth.join(dir, 'package.json'))) {
      const content = JSON.parse(await fs.readFile(pth.join(dir, 'package.json'), 'utf-8'))
      return {
        path: dir,
        ...content
      } as Info
    }

    dir = pth.join(dir, '..')
  }
  throw new Error('not found')
}


export interface Script {
  name: string
  source: string
}

import * as rd from 'recursive-readdir'

export async function getScripts(dir: string): Promise<Script[]> {

  const mutdir = pth.join(dir, 'mutations')
  const files = await rd(mutdir)
  const scripts = [] as Script[]

  for (var f of files) {
    if (!f.endsWith('.sql'))
      continue
    const name = f.replace(mutdir, '').replace(/.sql$/, '').slice(1)
    scripts.push({
      name,
      source: await fs.readFile(f, 'utf-8')
    })
  }

  return scripts
}