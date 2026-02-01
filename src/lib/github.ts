/* TypeScript - src/lib/github.ts
   GitHub helper using Octokit. Designed for client-provided access tokens (OAuth PKCE or PAT).
   Exports:
   - createBranchAndPR(token, owner, repo, baseBranch, newBranch, filePath, fileContent, commitMessage, prTitle, prBody)
*/

import { Octokit } from '@octokit/rest';

export type PRResult = {
  prNumber: number;
  prUrl: string;
};

export async function createBranchAndPR(
  token: string,
  owner: string,
  repo: string,
  baseBranch: string,
  newBranch: string,
  filePath: string,
  fileContent: string,
  commitMessage: string,
  prTitle: string,
  prBody: string
): Promise<PRResult> {
  const octokit = new Octokit({ auth: token });

  // 1) Resolve base branch commit SHA
  const {
    data: baseRefData,
  } = await octokit.git.getRef({
    owner,
    repo,
    ref: `heads/${baseBranch}`,
  });
  const baseSha = baseRefData.object.sha;

  // 2) Create branch ref (ignore if already exists)
  try {
    await octokit.git.createRef({
      owner,
      repo,
      ref: `refs/heads/${newBranch}`,
      sha: baseSha,
    });
  } catch (err: any) {
    // If ref already exists, continue; else rethrow
    const msg = err?.message ?? String(err);
    if (!/Reference already exists/i.test(msg)) throw err;
  }

  // 3) Create or update file on the new branch
  // Check if file exists on base branch (to get sha for update)
  let shaForUpdate: string | undefined = undefined;
  try {
    const getResp = await octokit.repos.getContent({
      owner,
      repo,
      path: filePath,
      ref: newBranch,
    });
    // @ts-ignore
    shaForUpdate = getResp.data?.sha;
  } catch (err: any) {
    // file may not exist on newBranch; check base branch
    try {
      const getResp = await octokit.repos.getContent({
        owner,
        repo,
        path: filePath,
        ref: baseBranch,
      });
      // @ts-ignore
      shaForUpdate = getResp.data?.sha;
    } catch {
      shaForUpdate = undefined;
    }
  }

  // Create or update file contents
  const contentBase64 = Buffer.from(fileContent, 'utf8').toString('base64');
  await octokit.repos.createOrUpdateFileContents({
    owner,
    repo,
    path: filePath,
    message: commitMessage,
    content: contentBase64,
    branch: newBranch,
    ...(shaForUpdate ? { sha: shaForUpdate } : {}),
  });

  // 4) Create PR from newBranch -> baseBranch
  const { data: pr } = await octokit.pulls.create({
    owner,
    repo,
    title: prTitle,
    head: newBranch,
    base: baseBranch,
    body: prBody,
  });

  return { prNumber: pr.number, prUrl: pr.html_url };
}