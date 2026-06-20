"use client";
import { ErrorState } from "@/presentation/components/ui";
export default function ErrorPage({ error, reset }: { error: Error; reset: () => void }) { return <div className="card"><ErrorState message={error.message} onRetry={reset} /></div>; }
