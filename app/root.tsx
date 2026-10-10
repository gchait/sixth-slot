import {
  isRouteErrorResponse,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
} from "react-router";

import type { Route } from "./+types/root";
import { TooltipProvider } from "~/components/ui/tooltip";
import "./app.css";

// Follows the system color scheme, set before first paint to avoid a flash.
const colorScheme = `(() => {
  const query = matchMedia("(prefers-color-scheme: dark)");
  const apply = () => document.documentElement.classList.toggle("dark", query.matches);
  apply();
  query.addEventListener("change", apply);
})();`;

export const links: Route.LinksFunction = () => [
  { rel: "icon", href: "/favicon.ico", sizes: "48x48" },
  { rel: "icon", href: "/favicon.svg", type: "image/svg+xml" },
];

const link = "hover:text-foreground underline underline-offset-2";

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <script dangerouslySetInnerHTML={{ __html: colorScheme }} />
        <Meta />
        <Links />
      </head>
      <body>
        <TooltipProvider>{children}</TooltipProvider>
        <footer className="text-muted-foreground mx-auto max-w-4xl px-4 pb-8 text-center text-xs">
          An unofficial fan project, not affiliated with or endorsed by
          Nintendo, Creatures Inc. or GAME FREAK inc., who own Pokémon. Data
          from{" "}
          <a className={link} href="https://pokeapi.co">
            PokeAPI
          </a>{" "}
          and{" "}
          <a className={link} href="https://bulbapedia.bulbagarden.net">
            Bulbapedia
          </a>
          ; source on{" "}
          <a className={link} href="https://github.com/gchait/sixth-slot">
            GitHub
          </a>
          .
        </footer>
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  return <Outlet />;
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let message = "Oops!";
  let details = "An unexpected error occurred.";
  let stack: string | undefined;

  if (isRouteErrorResponse(error)) {
    message = "Error";
    details = error.statusText || details;
  } else if (import.meta.env.DEV && error && error instanceof Error) {
    details = error.message;
    stack = error.stack;
  }

  return (
    <main className="pt-16 p-4 container mx-auto">
      <h1>{message}</h1>
      <p>{details}</p>
      {stack && (
        <pre className="w-full p-4 overflow-x-auto">
          <code>{stack}</code>
        </pre>
      )}
    </main>
  );
}
