import { pascalCase } from 'case-anything'
import stringify from 'fast-json-stable-stringify'
import { writeFile } from 'fs/promises'
import { printNode, zodToTs } from 'zod-to-ts'
import { IDataContainer } from './dc.js'
import { getGitHubCommit } from './github.js'
import { getRepoFilePath, getRepoVersionPath } from './repo.js'

export function dataContainerVersionFromGitCommit(repo: string, commit: Awaited<ReturnType<typeof getGitHubCommit>>) {
  const version = {
    id: commit.sha,
    text: commit.sha,
    timestamp: Date.parse(commit.commit.committer.date),
    sources: [`https://github.com/${repo}/tree/${commit.sha}`],
  } satisfies IDataContainer['version']

  return version
}

export async function writeData(data: IDataContainer, schema: Zod.AnyZodObject) {
  const version = Object.assign({}, data, { data: undefined })
  await writeFile(getRepoVersionPath(data.name, 'json'), stringify(version))
  await writeFile(getRepoFilePath(data.name, 'json'), stringify(data))
  await writeFile(
    getRepoFilePath(data.name, 'ts'),
    `/// Generated for ${data.name}\nexport type CppData_${pascalCase(data.name)} = ` +
      printNode(zodToTs(schema).node, {}),
  )
}
