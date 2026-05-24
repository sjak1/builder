"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";

export function NewProjectButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function create() {
    setBusy(true);
    const res = await fetch("/api/projects", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Untitled project" }),
    });
    const { id, error } = await res.json();
    setBusy(false);
    if (error) {
      alert(error);
      return;
    }
    router.push(`/p/${id}`);
  }

  return (
    <Button onClick={create} disabled={busy}>
      {busy ? "Creating…" : "New project"}
    </Button>
  );
}
