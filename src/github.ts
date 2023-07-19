import fetch from "node-fetch"

export async function getGitHubCommit(repo: string, branch: string) {
  const res = await fetch(`https://api.github.com/repos/${repo}/commits/${branch}`)
  if (!res.ok) throw new Error( `Failed to getGitCommit for ${repo} ${branch}: Error ${res.status}: ${res.statusText}`)
  return (await res.json()) as {
    sha: string
    commit: {
      tree: {
        sha: string
      }
      committer: {
        date: string
      }
      message: string
    }
  }
}

export async function getGitHubLatestCommitForPath(repo: string, branch: string, path: string) {
  const res = await fetch(`https://api.github.com/repos/${repo}/commits?${new URLSearchParams({
    sha: branch,
    path: path,
    page: "1",
    per_page: "1",
  }).toString()}`)
  if (!res.ok) throw new Error( `Failed to getGitHubLatestCommitForPath for ${repo} ${branch} ${path}: Error ${res.status}: ${res.statusText}`)
  return ((await res.json()) as [{
    sha: string
    commit: {
      tree: {
        sha: string
      }
      committer: {
        date: string
      }
      message: string
    }
  }])[0]
}


export async function fetchGitHubFile(repo: string, ref: string, file: string) {
  const res = await fetch(`https://raw.githubusercontent.com/${repo}/${ref}/${file}`)
  if (!res.ok) throw new Error(`Failed to fetchGitFile for ${repo} ${ref} ${file}: Error ${res.status}: ${res.statusText}`)
  return (await res.arrayBuffer())
}
