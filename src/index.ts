import { main } from "./cli/main";

async function runCli(argv = process.argv.slice(2)): Promise<number> {
  return main(argv);
}

if (import.meta.main) {
  try {
    const exitCode = await runCli();
    process.exitCode = exitCode;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exitCode = 1;
  }
}

export { runCli };
