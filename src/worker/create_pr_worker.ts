/**
 * Cloudflare Worker-compatible script (TypeScript-ish)
 *
 * Minimal /create-pr endpoint:
 * - Expects POST JSON:
 *   {
 *     code: string,
 *     code_verifier: string,
 *     owner: string,
 *     repo: string,
 *     baseBranch: string,
 *     newBranch: string,
 *     filePath: string,
 *     fileContent: string,
 *     commitMessage: string,
 *     prTitle: string,
 *     prBody?: string
 *   }
 *
 * Environment secrets required (set in Cloudflare Worker):
 * - GITHUB_CLIENT_ID
 * - GITHUB_CLIENT_SECRET
 *
 * Notes:
 * - Worker exchanges the OAuth code for an access_token (server-side).
 * - Worker never returns the access_token to client.
 * - Keep payload sizes reasonable.
 *
 * Deploy: copy to a Cloudflare Worker and bind secrets via wrangler or the dashboard.
 */

addEventListener("fetch", (event: any) => {
  event.respondWith(handleRequest(event.request));
});

async function handleRequest(request: Request) {
  const url = new URL(request.url);

  // Simple GET endpoints for health and root
  if (request.method === "GET") {
    if (url.pathname === "/" || url.pathname === "") {
      return new Response(JSON.stringify({ status: "ok", service: "onedest-switchboard-auth" }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    if (url.pathname === "/health" || url.pathname === "/health/") {
      return new Response(JSON.stringify({ status: "ok" }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    return new Response("Method Not Allowed", { status: 405 });
  }

  if (request.method !== "POST") return new Response("Method Not Allowed", { status: 405 });
  if (!url.pathname.endsWith("/create-pr")) return new Response("Not Found", { status: 404 });

  let body: any;
  try {
    body = await request.json();
  } catch (err) {
    return new Response("Invalid JSON", { status: 400 });
  }

  const required = ["code", "code_verifier", "owner", "repo", "baseBranch", "newBranch", "filePath", "fileContent", "commitMessage", "prTitle"];
  for (const k of required) if (!body[k]) return new Response(`Missing ${k}`, { status: 400 });

  const clientId = (globalThis as any).GITHUB_CLIENT_ID;
  const clientSecret = (globalThis as any).GITHUB_CLIENT_SECRET;
  if (!clientId || !clientSecret) return new Response("Server misconfiguration: missing GitHub secrets", { status: 500 });

  try {
    // 1) Exchange code for access token
    const tokenResp = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code: body.code,
        code_verifier: body.code_verifier,
      }),
    });
    const tokenJson = await tokenResp.json();
    if (!tokenJson.access_token) return new Response(JSON.stringify({ error: "token_exchange_failed", detail: tokenJson }), { status: 500 });

    const token = tokenJson.access_token;

    // 2) Use GitHub API to create branch (ref) from baseBranch
    const apiBase = "https://api.github.com";
    const headers = { Authorization: `token ${token}`, Accept: "application/vnd.github.v3+json" };

    // get base branch commit sha
    const refResp = await fetch(`${apiBase}/repos/${body.owner}/${body.repo}/git/ref/heads/${encodeURIComponent(body.baseBranch)}`, { headers });
    if (!refResp.ok) {
      const txt = await refResp.text();
      return new Response(`Failed to get base branch: ${txt}`, { status: 500 });
    }
    const refJson = await refResp.json();
    const baseSha = refJson.object?.sha;
    if (!baseSha) return new Response("Unable to resolve base branch commit", { status: 500 });

    // create new branch ref (ignore if exists)
    const createRefResp = await fetch(`${apiBase}/repos/${body.owner}/${body.repo}/git/refs`, {
      method: "POST",
      headers,
      body: JSON.stringify({ ref: `refs/heads/${body.newBranch}`, sha: baseSha }),
    });
    if (createRefResp.status !== 201 && createRefResp.status !== 422) {
      // 422 means ref already exists - continue
      const txt = await createRefResp.text();
      return new Response(`Failed to create branch: ${txt}`, { status: 500 });
    }

    // 3) Create or update file on new branch
    // Check if file exists on newBranch
    let shaForUpdate: string | undefined = undefined;
    try {
      const getResp = await fetch(`${apiBase}/repos/${body.owner}/${body.repo}/contents/${encodeURIComponent(body.filePath)}?ref=${encodeURIComponent(body.newBranch)}`, { headers });
      if (getResp.ok) {
        const getJson = await getResp.json();
        shaForUpdate = getJson.sha;
      }
    } catch { /* ignore */ }

    // create/update file
    const contentBase64 = btoa(body.fileContent);
    const putResp = await fetch(`${apiBase}/repos/${body.owner}/${body.repo}/contents/${encodeURIComponent(body.filePath)}`, {
      method: "PUT",
      headers,
      body: JSON.stringify({
        message: body.commitMessage,
        content: contentBase64,
        branch: body.newBranch,
        ...(shaForUpdate ? { sha: shaForUpdate } : {}),
      }),
    });
    if (!putResp.ok) {
      const txt = await putResp.text();
      return new Response(`Failed to create/update file: ${txt}`, { status: 500 });
    }

    // 4) Create PR
    const prResp = await fetch(`${apiBase}/repos/${body.owner}/${body.repo}/pulls`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        title: body.prTitle,
        head: body.newBranch,
        base: body.baseBranch,
        body: body.prBody ?? "",
      }),
    });
    if (!prResp.ok) {
      const txt = await prResp.text();
      return new Response(`Failed to create PR: ${txt}`, { status: 500 });
    }
    const prJson = await prResp.json();
    return new Response(JSON.stringify({ prUrl: prJson.html_url }), { status: 200, headers: { "Content-Type": "application/json" } });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
}
