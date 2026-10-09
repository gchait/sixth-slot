// Starts React Router's dev server with Node's development condition, which
// the CLI otherwise adds by relaunching itself.
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const cli = fileURLToPath(
  new URL("../node_modules/@react-router/dev/bin.cjs", import.meta.url),
);
const child = spawn(
  process.execPath,
  ["--conditions=development", cli, "dev", ...process.argv.slice(2)],
  { stdio: "inherit" },
);
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => child.kill(signal));
}
child.on("exit", (code, signal) => {
  process.exitCode = code ?? (signal ? 1 : 0);
});
