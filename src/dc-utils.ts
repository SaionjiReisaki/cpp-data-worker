import promiseSpawn from '@npmcli/promise-spawn'
import { pascalCase } from 'case-anything'
import stringify from 'fast-json-stable-stringify'
import { pathExists } from 'fs-extra/esm'
import { readFile, writeFile } from 'fs/promises'
import { isDeepStrictEqual } from 'util'
import { z } from 'zod'
import { printNode, zodToTs } from 'zod-to-ts'
import { CONTAINER_TYPE, CONTAINER_VERSION, IDataContainer, IDataContainerHeader } from './dc.js'
import { getGitHubCommit } from './github.js'
import { getRepoDir, getRepoFilePath, getRepoVersionPath } from './repo.js'

export function dataContainerVersionFromGitCommit(repo: string, commit: Awaited<ReturnType<typeof getGitHubCommit>>) {
  const version = {
    id: commit.sha,
    text: commit.sha,
    timestamp: Date.parse(commit.commit.committer.date),
    sources: [`https://github.com/${repo}/tree/${commit.sha}`],
    schema: 0,
  } satisfies IDataContainerHeader['version']

  return version
}

function encode(s: object): string {
  return stringify(s)
}

export async function readData<T>(name: string) {
  const data = JSON.parse(await readFile(getRepoFilePath(name, 'json'), 'utf-8')) as IDataContainer<T>
  return data
}

async function writeData(data: IDataContainer, schema: Zod.AnyZodObject) {
  const version = Object.assign({}, data, { data: undefined })
  await writeFile(getRepoVersionPath(data.name, 'json'), encode(version))
  await writeFile(getRepoFilePath(data.name, 'json'), encode(data))
  await writeFile(
    getRepoFilePath(data.name, 'ts'),
    `/// Generated for ${data.name}\nexport type CppData_${pascalCase(data.name)} = ` +
      printNode(zodToTs(schema).node, {}),
  )
}

export async function buildData<R extends any[] = [], T extends object = object>(
  name: string,
  buildVersion: () => Promise<readonly [IDataContainerHeader['version'], ...R]>,
  buildData: (...args: R) => Promise<readonly [T, z.AnyZodObject]>,
) {
  console.log('fetching version for', name)
  const [version, ...args] = await buildVersion()

  let previousData: IDataContainer<T> | undefined = undefined
  let previousVersion: IDataContainerHeader | undefined = undefined
  let forceUpdate = false
  let needUpdate = false

  if (await pathExists(getRepoVersionPath(name, 'json'))) {
    previousVersion = JSON.parse(await readFile(getRepoVersionPath(name, 'json'), 'utf-8')) as IDataContainerHeader
    forceUpdate = forceUpdate || previousVersion['@type'] !== CONTAINER_TYPE
    forceUpdate = forceUpdate || previousVersion['@version'] !== CONTAINER_VERSION
    forceUpdate = forceUpdate || previousVersion['name'] !== name
    forceUpdate = forceUpdate || previousVersion['version']?.schema !== version.schema
    needUpdate = needUpdate || !isDeepStrictEqual(previousVersion.version, version)
  } else {
    forceUpdate = true
  }

  if (await pathExists(getRepoFilePath(name, 'json'))) {
    previousData = JSON.parse(await readFile(getRepoFilePath(name, 'json'), 'utf-8')) as IDataContainer<T>
    forceUpdate = forceUpdate || previousData['@type'] !== CONTAINER_TYPE
    forceUpdate = forceUpdate || previousData['@version'] !== CONTAINER_VERSION
    forceUpdate = forceUpdate || previousData['name'] !== name
    forceUpdate = forceUpdate || previousData['version']?.schema !== version.schema
    needUpdate = needUpdate || !isDeepStrictEqual(previousData.version, version)
  } else {
    forceUpdate = true
  }

  if (previousData && previousVersion) {
    forceUpdate = forceUpdate || !isDeepStrictEqual(previousData.version, previousVersion.version)
  }

  console.log('needUpdate', needUpdate, 'forceUpdate', forceUpdate)
  if (!needUpdate && !forceUpdate) return

  console.log('building data')
  const [data, schema] = await buildData(...args)

  if (!forceUpdate && previousData) {
    if (isDeepStrictEqual(previousData.data, JSON.parse(encode(data)))) {
      console.log('data not changed at all, keep previous version')
      return
    }
  }

  console.log('writing')
  await writeData(
    {
      '@type': CONTAINER_TYPE,
      '@version': CONTAINER_VERSION,
      name: name,
      version,
      data: data,
    },
    schema,
  )

  console.log('committing')
  const files = [getRepoVersionPath(name, 'json'), getRepoFilePath(name, 'json'), getRepoFilePath(name, 'ts')]
  await promiseSpawn('git', ['add', '--', ...files], { stdio: 'inherit', cwd: getRepoDir() })
  await promiseSpawn(
    'git',
    [
      'commit',
      '--allow-empty',
      '--message',
      `[${name}] ${version.id} @ ${new Date(version.timestamp).toJSON()}\n\n${version.text}`.trim(),
      '--',
      ...files,
    ],
    { stdio: 'inherit', cwd: getRepoDir() },
  )
}
