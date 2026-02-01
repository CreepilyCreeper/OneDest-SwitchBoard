"use client";

import { useEffect } from "react";

export default function OAuthCallback() {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const state = params.get("state");
    try {
      if (window.opener && code) {
        // Post code to opener; allow any origin because opener controls UI — caller should validate state.
        window.opener.postMessage({ type: "onedest_oauth", code, state }, window.location.origin);
      }
    } catch (e) {
      // ignore
    }
  }, []);
  return <div style={{ padding: 20 }}>Authorization complete. You may close this tab.</div>;
}