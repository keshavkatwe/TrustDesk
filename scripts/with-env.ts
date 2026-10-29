const [command, ...args] = process.argv.slice(2);

if (!command) {
  console.error('Usage: bun scripts/with-env.ts <command> [args...]');
  process.exit(1);
}

// Bun loads the root .env here; forward it explicitly to Turbo's child processes.
const child = Bun.spawn([command, ...args], {
  env: process.env,
  stdin: 'inherit',
  stdout: 'inherit',
  stderr: 'inherit',
});

process.on('SIGINT', () => child.kill('SIGINT'));
process.on('SIGTERM', () => child.kill('SIGTERM'));

process.exit(await child.exited);
