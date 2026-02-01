/* TypeScript - src/lib/oauth.ts
   Minimal PKCE helpers for initiating GitHub OAuth from a static client.
   Exports:
   - OAuthInitiation(): { codeVerifier, codeChallenge, state }
   - buildAuthUrl(params): string
   - savePKCEVerifier(verifier: string)
   - loadPKCEVerifier(): string | null
*/

function randBytes(len: number) {
  const arr = new Uint8Array(len);
  const webCrypto = (globalThis as any).crypto as any | undefined;
  if (webCrypto && typeof webCrypto.getRandomValues === "function") {
    webCrypto.getRandomValues(arr);
  } else {
    for (let i = 0; i < len; i++) arr[i] = Math.floor(Math.random() * 256);
  }
  return arr;
}

function base64urlencode(a: Uint8Array) {
  // base64 encode then make URL-safe
  let str = "";
  for (let i = 0; i < a.length; i++) str += String.fromCharCode(a[i]);
  const b64 = typeof btoa !== "undefined" ? btoa(str) : Buffer.from(str, "binary").toString("base64");
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function sha256(bytes: Uint8Array) {
  const webCrypto = (globalThis as any).crypto as any | undefined;
  if (webCrypto && webCrypto.subtle && typeof webCrypto.subtle.digest === "function") {
    const hash = await webCrypto.subtle.digest("SHA-256", bytes);
    return new Uint8Array(hash);
  } else {
    // Node fallback (shouldn't be used in client)
    const { createHash } = require("crypto");
    const h = createHash("sha256");
    h.update(Buffer.from(bytes));
    return new Uint8Array(h.digest());
  }
}

export function OAuthInitiation() {
  // code verifier: high-entropy random string
  const cvBytes = randBytes(64);
  const codeVerifier = base64urlencode(cvBytes);
  const state = base64urlencode(randBytes(12));
  // code challenge derived via SHA256
  // Note: return promise for codeChallenge? keep API synchronous by returning promise-like usage below
  const codeChallengePromise = sha256(Buffer.from(codeVerifier, "utf8")).then((hash) => base64urlencode(hash));
  // We return the promise for codeChallenge along with verifier/state
  // Caller can await codeChallengePromise or handle as async
  return {
    codeVerifier,
    codeChallengePromise,
    state,
  };
}

export async function buildAuthUrl(opts: {
  clientId: string;
  redirectUri: string;
  scope?: string;
  state: string;
  codeChallenge: string;
}) {
  const params = new URLSearchParams({
    client_id: opts.clientId,
    redirect_uri: opts.redirectUri,
    scope: opts.scope ?? "repo",
    state: opts.state,
    code_challenge: opts.codeChallenge,
    code_challenge_method: "S256",
    allow_signup: "false",
  });
  return `https://github.com/login/oauth/authorize?${params.toString()}`;
}

export function savePKCEVerifier(verifier: string) {
  try {
    localStorage.setItem("onedest_pkce_verifier", verifier);
  } catch {
    // ignore
  }
}

export function loadPKCEVerifier() {
  try {
    return localStorage.getItem("onedest_pkce_verifier");
  } catch {
    return null;
  }
}

// Convenience wrapper to build auth url with async code challenge
export async function buildAuthUrlWithPKCE(params: {
  clientId: string;
  redirectUri: string;
  scope?: string;
}) {
  const init = OAuthInitiation();
  const codeVerifier = init.codeVerifier;
  const state = init.state;
  const codeChallenge = await init.codeChallengePromise;
  savePKCEVerifier(codeVerifier);
  return {
    authUrl: await buildAuthUrl({ clientId: params.clientId, redirectUri: params.redirectUri, scope: params.scope, state, codeChallenge }),
    state,
    codeVerifier,
    codeChallenge,
  };
}