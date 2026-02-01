"use client";

import React from "react";
import type { NodeDef, Exit } from "../lib/router";
import { validateRouterLayout } from "../lib/router";

type Props = { node: NodeDef | null; onClose?: () => void };

export default function RouterCard({ node, onClose }: Props) {
  if (!node) return null;
  const exits: Exit[] = node.exits ?? [];
  const result = validateRouterLayout(exits);

  return (
    <div style={{ position: "absolute", right: 12, top: 72, zIndex: 1200, width: 360, background: "white", padding: 12, borderRadius: 6, boxShadow: "0 6px 18px rgba(0,0,0,0.12)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <strong>Router Configuration — {node.id}</strong>
        <button onClick={onClose} style={{ border: "none", background: "transparent", cursor: "pointer" }}>✕</button>
      </div>

      <div style={{ marginBottom: 8 }}>
        <small>Exits:</small>
        <ul>
          {exits.map((ex, i) => (
            <li key={i}>
              <strong>{ex.direction}</strong>: {ex.onedest_args.join(", ")}
            </li>
          ))}
        </ul>
      </div>

      <div style={{ padding: 8, borderRadius: 4, background: result.status === "UNORDERED_SAFE" ? "#e6ffed" : "#fff4f4" }}>
        {result.status === "UNORDERED_SAFE" ? (
          <div>
            <strong style={{ color: "#0f5132" }}>UNORDERED_SAFE</strong>
            <div style={{ color: "#0f5132" }}>No prefix collisions detected across different exits.</div>
          </div>
        ) : (
          <div>
            <strong style={{ color: "#842029" }}>CONFLICT_DETECTED</strong>
            <div style={{ color: "#842029" }}>{result.reason}</div>
            <div style={{ marginTop: 6 }}>
              <small>Conflict:</small>
              <div>
                <code>{result.conflict.argA}</code> (exit {result.conflict.exitA.direction}) is a prefix of <code>{result.conflict.argB}</code> (exit {result.conflict.exitB.direction})
              </div>
              <div style={{ marginTop: 6, fontSize: 13 }}>
                Recommendation: Use an ORDERED physical layout; place the more specific destination physically before the prefix destination.
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}