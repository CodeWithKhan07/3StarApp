import Link from "next/link";
import { routes } from "@/lib/routes";
export default function NotFound() { return <main className="empty-state" style={{ minHeight: "100vh" }}><h1>Page not found</h1><p>The requested screen does not exist or has moved.</p><Link className="button button--primary" href={routes.dashboard}>Return to Dashboard</Link></main>; }
