import { Link } from "react-router";

export function meta() {
  return [{ title: "Page not found · sixth-slot" }];
}

export default function NotFound() {
  return (
    <main className="mx-auto max-w-6xl space-y-2 px-4 py-8">
      <Link to="/" className="text-muted-foreground text-sm hover:underline">
        ← sixth-slot
      </Link>
      <h1 className="text-3xl font-bold tracking-tight">Page not found</h1>
      <p className="text-muted-foreground">There is no page at this address.</p>
    </main>
  );
}
