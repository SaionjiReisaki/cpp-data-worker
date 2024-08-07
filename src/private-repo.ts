import { readFile, stat } from 'fs/promises'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import { SimpleGit, simpleGit } from 'simple-git'

export function getPrivateBase() {
  return path.resolve(fileURLToPath(import.meta.url), '../../private')
}

export class PrivateRepo {
  public constructor(name: string) {
    this.name = path.join(getPrivateBase(), name)
    this.git = simpleGit({ baseDir: this.name })
  }

  public readonly name: string
  public readonly git: SimpleGit

  public async getCommit(file?: string) {
    return await this.git.log({ file: file, maxCount: 1 })
  }

  public async read(file: string) {
    return readFile(path.join(this.name, file))
  }

  public async exists(file: string) {
    if (await stat(path.join(this.name, file)).catch(() => null)) {
      return true
    }
  }
}
