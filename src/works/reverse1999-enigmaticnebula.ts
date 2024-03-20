import { buildReverse1999 } from './reverse1999-yuanyan3060.js'

export async function makeReverse1999EnigmaticNebula(lang: 'en' | 'jp' | 'kr' | 'tw' | 'zh') {
  const file = 'reverse1999-enigmaticnebula-' + lang
  const repo = 're1999-excel-en'
  return buildReverse1999(file, repo, { lang: lang, server: lang })
}
