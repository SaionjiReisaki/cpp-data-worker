import promiseSpawn from '@npmcli/promise-spawn'
import { Command, Option, runExit } from 'clipanion'
import { mkdirp, pathExists } from 'fs-extra/esm'
import { minimatch } from 'minimatch'
import { getRepoDir, getRepoFilesDir, getRepoVersionsDir, getWorkDir } from './repo.js'
import { makeArknightsHeyboxOperatorSurvey } from './works/arknights-heybox-operatorsurvey.js'
import { makeArknightsKengxxiao } from './works/arknights-kengxxiao.js'
import { makeArknightsYituliuOperatorSurvey } from './works/arknights-yituliu-operatorsurvey.js'
import { makeArknightsYituliuValues } from './works/arknights-yituliu-values.js'
import { makeReverse1999EnigmaticNebula } from './works/reverse1999-enigmaticnebula.js'
import { makeReverse1999HisboundenDutyDrops } from './works/reverse1999-hisboundenduty-drops.js'
import { makeReverse1999HisboundenDutyValues } from './works/reverse1999-hisboundenduty-values.js'
import { makeReverse1999Yuanyan3060 } from './works/reverse1999-yuanyan3060.js'

runExit(
  class MainCommand extends Command {
    private push = Option.Boolean('--push', false)
    private globs = Option.Rest()

    private tasks = {
      'arknights-kengxxiao-zh_CN': () => makeArknightsKengxxiao('zh_CN'),
      'arknights-kengxxiao-en_US': () => makeArknightsKengxxiao('en_US'),
      'arknights-kengxxiao-ja_JP': () => makeArknightsKengxxiao('ja_JP'),
      'arknights-kengxxiao-ko_KR': () => makeArknightsKengxxiao('ko_KR'),
      'arknights-heybox-operatorsurvey': () => makeArknightsHeyboxOperatorSurvey(),
      'arknights-yituliu-values': () => makeArknightsYituliuValues(),
      'arknights-yituliu-operatorsurvey': () => makeArknightsYituliuOperatorSurvey(),
      'reverse1999-hisboundenduty-drops-china': () => makeReverse1999HisboundenDutyDrops('china'),
      'reverse1999-hisboundenduty-drops-values': () => makeReverse1999HisboundenDutyValues('china'),
    } as Record<string, () => Promise<void>>

    private privateTasks = {
      'reverse1999-yuanyan3060-zh_CN': () => makeReverse1999Yuanyan3060('zh_CN'),
      'reverse1999-enigmaticnebula-en': () => makeReverse1999EnigmaticNebula('en'),
      'reverse1999-enigmaticnebula-jp': () => makeReverse1999EnigmaticNebula('jp'),
      'reverse1999-enigmaticnebula-kr': () => makeReverse1999EnigmaticNebula('kr'),
      'reverse1999-enigmaticnebula-tw': () => makeReverse1999EnigmaticNebula('tw'),
      'reverse1999-enigmaticnebula-zh': () => makeReverse1999EnigmaticNebula('zh'),
    } as Record<string, () => Promise<void>>

    public async execute() {
      await setup()

      if (process.env.ENABLE_PRIVATE_REPOS) {
        Object.assign(this.tasks, this.privateTasks)
      }

      const keys = Object.keys(this.tasks)
      const filtered = new Set(this.globs.flatMap((x) => minimatch.match(keys, x, { matchBase: true })))
      console.log('task will be running', filtered)

      for (const key of filtered) {
        await this.tasks[key]()
      }

      if (this.push) {
        await promiseSpawn('git', ['push', '--set-upstream', 'origin', 'master'], {
          stdio: 'inherit',
          cwd: getRepoDir(),
        })
      }
    }
  },
).then(
  () => process.exit(process.exitCode),
  (e) => (console.error(e), process.exit(process.exitCode || 1)),
)

async function setup() {
  if (!(await pathExists(getRepoDir())) && process.env.REPO_GITHUB_TOKEN) {
    await mkdirp(getWorkDir())
    await promiseSpawn(
      'git',
      ['clone', `https://${process.env.REPO_GITHUB_TOKEN}@github.com/SaionjiReisaki/cpp-data.git`, getRepoDir()],
      { stdio: 'inherit' },
    )
  }

  await promiseSpawn('git', ['fetch'], {
    stdio: 'inherit',
    cwd: getRepoDir(),
  })
  try {
    await promiseSpawn('git', ['checkout', 'master'], { stdio: 'inherit', cwd: getRepoDir() })
    let shouldPull = false
    try {
      await promiseSpawn('git', ['branch', '--set-upstream-to=origin/master', 'master'], {
        stdio: 'inherit',
        cwd: getRepoDir(),
      })
      shouldPull = true
    } catch {
      shouldPull = false
    }
    if (shouldPull) {
      await promiseSpawn('git', ['reset', '--hard', 'origin/master'], { stdio: 'inherit', cwd: getRepoDir() })
    }
  } catch {
    await promiseSpawn('git', ['checkout', '-b', 'master'], { stdio: 'inherit', cwd: getRepoDir() })
  }
  await promiseSpawn('git', ['config', 'user.name', 'SaionjiBot'], { stdio: 'inherit', cwd: getRepoDir() })
  await promiseSpawn('git', ['config', 'user.email', 'SaionjiBot@ouomail.com'], { stdio: 'inherit', cwd: getRepoDir() })

  await mkdirp(getRepoFilesDir())
  await mkdirp(getRepoVersionsDir())
}
