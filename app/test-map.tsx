"use client";

import dynamic from "next/dynamic";

const Map = dynamic(() => import("@/components/Map"), {
  ssr: false,
  loading: () => <div style={{ height: "100%", width: "100%" }}>Loading...</div>,
});

export default function TestPage() {
  return (
    <div>
      <Map />
    </div>
  );
}
