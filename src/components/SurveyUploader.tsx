"use client";

import React, { useState, useEffect, useRef } from "react";
import type { Graph, SurveyReport } from "../lib/router";
import { reconcileSurvey } from "../lib/router";
import { buildAuthUrlWithPKCE, loadPKCEVerifier } from "../lib/oauth";

type Props = { graph: Graph; onApply?: (updatedEdges: any[]) => void };

/**
 * SurveyUploader (wired)
 * - Upload a Survey Report (JSON)
 * - Run reconcileSurvey against provided graph (client-side)
 * - Show a preview diff of changed edges (coverage)
 * - "Approve" flow:
 *   * Initiates PKCE (via buildAuthUrlWithPKCE), opens GitHub auth popup
 *   * Listens for postMessage from oauth-callback with { code, state }
 *   * Retrieves code_verifier from localStorage and POSTS payload to CF Worker /create-pr
 *   * Displays PR URL on success
 *
 * Defaults (can be overridden at runtime):
 * - owner: CreepilyCreeper
 * - repo: OneDest-SwitchBoard
 * - baseBranch: main
 * - filePath: onedest-network.json
 * - workerUrl: from NEXT_PUBLIC_CF_WORKER_URL or https://onedest-switchboard-auth.icenia-auth.workers.dev/create-pr
 */

const DEFAULT_OWNER = "CreepilyCreeper";
const DEFAULT_REPO = "OneDest-SwitchBoard";
const DEFAULT_BASE = "main";
const DEFAULT_FILEPATH = "onedest-network.json";
const DEFAULT_WORKER = typeof process !== "undefined" && (process.env as any).NEXT_PUBLIC_CF_WORKER_URL
  ? (process.env as any).NEXT_PUBLIC_CF_WORKER_URL
  : "https://onedest-switchboard-auth.icenia-auth.workers.dev/create-pr";

export default function SurveyUploader({ graph, onApply }: Props) {
  const [report, setReport] = useState<SurveyReport | null>(null);
  const [diffs, setDiffs] = useState<any[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [prUrl, setPrUrl] = useState<string | null>(null);
  const popupRef = useRef<Window | null>(null);
  const resolverRef = useRef<((v: any) => void) | null>(null);

  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if (!e.data || e.data.type !== "onedest_oauth") return;
      if (resolverRef.current) {
        resolverRef.current(e.data);
        resolverRef.current = null;
      }
      // close popup if still open
      try {
        popupRef.current?.close();
      } catch {}
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  const waitForCode = (): Promise<{ code: string; state?: string }> =>
    new Promise((resolve) => {
      resolverRef.current = resolve;
    });

  const handleFile = async (file: File | null) => {
    setError(null);
    setReport(null);
    setDiffs(null);
    setPrUrl(null);
    if (!file) return;
    try {
      const txt = await file.text();
      const json = JSON.parse(txt) as SurveyReport;
      setReport(json);
      const { updatedEdges, diffs } = reconcileSurvey(graph, json);
      setDiffs(diffs);
    } catch (e: any) {
      setError(e?.message ?? String(e));
    }
  };

  const genBranchName = () => {
    const now = new Date();
    const y = now.getUTCFullYear();
    const m = String(now.getUTCMonth() + 1).padStart(2, "0");
    const d = String(now.getUTCDate()).padStart(2, "0");
    const rnd = Math.random().toString(36).slice(2, 7);
    return `onedest-update-${y}${m}${d}-${rnd}`;
  };

  const handleApprove = async () => {
    setError(null);
    setPrUrl(null);
    if (!diffs || diffs.length === 0) {
      setError("No diffs to apply.");
      return;
    }
    setBusy(true);
    try {
      // Build full network JSON (client will send full fileContent)
      const networkJson = JSON.stringify(graph, null, 2);

      // Initiate PKCE and get auth URL + state
      const pkce = await buildAuthUrlWithPKCE({
        clientId: (window as any).NEXT_PUBLIC_GITHUB_CLIENT_ID || (process.env as any).NEXT_PUBLIC_GITHUB_CLIENT_ID || "",
        redirectUri: (window as any).NEXT_PUBLIC_OAUTH_REDIRECT || (process.env as any).NEXT_PUBLIC_OAUTH_REDIRECT || `${window.location.origin}/oauth-callback`,
        scope: "repo",
      });

      if (!pkce || !pkce.authUrl) {
        throw new Error("Failed to build auth url");
      }

      // Open popup
      popupRef.current = window.open(pkce.authUrl, "onedest_oauth", "width=900,height=700");
      if (!popupRef.current) throw new Error("Popup blocked");

      // Wait for code from oauth-callback via postMessage
      const msg = await waitForCode();
      if (!msg?.code) throw new Error("No code returned from OAuth");

      // Retrieve code_verifier
      const codeVerifier = loadPKCEVerifier();
      if (!codeVerifier) throw new Error("Missing PKCE code_verifier (was it stored?)");

      // Build PR payload
      const payload = {
        code: msg.code,
        code_verifier: codeVerifier,
        owner: DEFAULT_OWNER,
        repo: DEFAULT_REPO,
        baseBranch: DEFAULT_BASE,
        newBranch: genBranchName(),
        filePath: DEFAULT_FILEPATH,
        fileContent: networkJson,
        commitMessage: "Bulk update from SwitchBoard",
        prTitle: "Bulk network.json updates (SwitchBoard)",
        prBody: `Automated PR created by OneDest SwitchBoard. Diffs: ${diffs.length} edges modified.`,
      };

      // POST to Cloudflare Worker
      const workerUrl = (window as any).NEXT_PUBLIC_CF_WORKER_URL || DEFAULT_WORKER;
      const resp = await fetch(workerUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!resp.ok) {
        const txt = await resp.text();
        throw new Error(`Worker error: ${txt}`);
      }
      const j = await resp.json();
      setPrUrl(j.prUrl || null);
      if (onApply) onApply(diffs.map((d) => d.edgeId));
    } catch (err: any) {
      setError(err?.message ?? String(err));
    } finally {
      setBusy(false);
      try {
        popupRef.current?.close();
      } catch {}
    }
  };

  return (
    <div style={{ position: "absolute", left: 12, top: 72, zIndex: 1200, width: 420, background: "white", padding: 12, borderRadius: 6, boxShadow: "0 6px 18px rgba(0,0,0,0.12)" }}>
      <strong>Survey Uploader</strong>
      <div style={{ marginTop: 8 }}>
        <input type="file" accept=".json,application/json" onChange={(e) => handleFile(e.target.files?.[0] ?? null)} />
      </div>

      {error && <div style={{ color: "red", marginTop: 8 }}>{error}</div>}
      {busy && <div style={{ color: "#0d6efd", marginTop: 8 }}>Processing...</div>}
      {prUrl && (
        <div style={{ marginTop: 8 }}>
          <div>PR created: <a href={prUrl} target="_blank" rel="noreferrer">{prUrl}</a></div>
        </div>
      )}

      {report && (
        <div style={{ marginTop: 8 }}>
          <div><small>Report samples: {report.samples.length}</small></div>
        </div>
      )}

      {diffs && (
        <div style={{ marginTop: 10 }}>
          <strong>Preview Diffs</strong>
          <ul style={{ maxHeight: 220, overflow: "auto" }}>
            {diffs.map((d: any) => (
              <li key={d.edgeId} style={{ marginBottom: 6 }}>
                <div><strong>{d.edgeId}</strong></div>
                <div>Old segments: <code>{JSON.stringify(d.oldSegments ?? "none")}</code></div>
                <div>New segments: <code>{JSON.stringify(d.newSegments)}</code></div>
                <div style={{ fontSize: 12, color: "#555" }}>Suggestion: review then approve to open PR</div>
              </li>
            ))}
          </ul>

          <div style={{ marginTop: 8, display: "flex", gap: 8 }}>
            <button onClick={handleApprove} style={{ padding: "8px 12px", background: "#0d6efd", color: "white", border: "none", borderRadius: 4 }} disabled={busy}>
              Approve & Create PR
            </button>
            <button onClick={() => { setDiffs(null); setReport(null); setPrUrl(null); }} style={{ padding: "8px 12px", borderRadius: 4 }}>
              Reset
            </button>
          </div>
        </div>
      )}
    </div>
  );
}