"use client";

import React, { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import type { EdgeDef } from "../src/lib/router";

// Dynamically import the Map component to avoid SSR issues with leaflet
const MapClient = dynamic(() => import("../src/components/Map"), { ssr: false });

export default function Page() {
  const [network, setNetwork] = useState<{ edges: EdgeDef[] } | null>(null);
  useEffect(() => {
    // Load example network from public folder with basePath support
    const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';
    fetch(`${basePath}/network.example.json`)
      .then((r) => r.json())
      .then((j) => setNetwork(j))
      .catch(() => setNetwork(null));
  }, []);

  return (
    <main style={{ height: "100vh", width: "100vw" }}>
      <h1 style={{ position: "absolute", zIndex: 1000, margin: 12 }}>OneDest SwitchBoard — Map</h1>
      <div style={{ height: "100%", width: "100%" }}>
        <MapClient edges={network?.edges ?? []} />
      </div>
    </main>
  );
}