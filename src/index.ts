import { mkdirp } from 'fs-extra/esm'
import { getRepoFilesDir, getRepoVersionsDir } from './repo.js'
import { makeArknightsKengxxiao } from './works/arknights-kengxxiao.js'


async function main() {
  await mkdirp(getRepoFilesDir())
  await mkdirp(getRepoVersionsDir())

  await makeArknightsKengxxiao('zh_CN')
}

main().then(
  () => process.exit(0),
  (e) => (console.error(e), process.exit(1)),
)