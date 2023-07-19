import * as path from 'node:path'
import { fileURLToPath } from 'node:url'

export function getWorkDir() {
  return path.resolve(fileURLToPath(import.meta.url), '../../work')
}

export function getRepoDir() {
  return path.resolve(getWorkDir(), 'data-repo')
}

export function getRepoFilesDir() {
  return path.resolve(getRepoDir(), 'files')
}

export function getRepoFilePath(name: string, format: 'json' | 'ts') {
  return path.resolve(getRepoFilesDir(), `${name}.${format}`)
}

export function getRepoVersionsDir() {
  return path.resolve(getRepoDir(), 'versions')
}

export function getRepoVersionPath(name: string, format: 'json' | 'ts') {
  return path.resolve(getRepoVersionsDir(), `${name}.version.${format}`)
}
