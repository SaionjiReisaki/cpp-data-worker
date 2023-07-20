import promiseSpawn from '@npmcli/promise-spawn'
import { mkdirp, pathExists } from 'fs-extra/esm'
import { getRepoDir, getRepoFilesDir, getRepoVersionsDir, getWorkDir } from './repo.js'
import { makeArknightsKengxxiao } from './works/arknights-kengxxiao.js'

async function main() {
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
      await promiseSpawn('git', ['pull'], { stdio: 'inherit', cwd: getRepoDir() })
      await promiseSpawn('git', ['reset', '--hard', 'origin/master'], { stdio: 'inherit', cwd: getRepoDir() })
    }
  } catch {
    await promiseSpawn('git', ['checkout', '-b', 'master'], { stdio: 'inherit', cwd: getRepoDir() })
  }
  await promiseSpawn('git', ['config', 'user.name', 'SaionjiBot'], { stdio: 'inherit', cwd: getRepoDir() })
  await promiseSpawn('git', ['config', 'user.email', 'SaionjiBot@ouomail.com'], { stdio: 'inherit', cwd: getRepoDir() })

  await mkdirp(getRepoFilesDir())
  await mkdirp(getRepoVersionsDir())

  await makeArknightsKengxxiao('zh_CN')
  await makeArknightsKengxxiao('en_US')

  // await promiseSpawn('git', ['push', '--set-upstream', 'origin', 'master'], { stdio: 'inherit', cwd: getRepoDir() })
}

main().then(
  () => process.exit(0),
  (e) => (console.error(e), process.exit(1)),
)
