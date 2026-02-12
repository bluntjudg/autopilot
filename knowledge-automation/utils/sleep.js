export async function cooldownTimer(minMinutes = 3, maxMinutes = 5) {
  const minMs = minMinutes * 60 * 1000;
  const maxMs = maxMinutes * 60 * 1000;
  const waitMs = Math.floor(Math.random() * (maxMs - minMs)) + minMs;

  let remaining = Math.floor(waitMs / 1000);

  console.log(`⏳ Cooldown started (${Math.floor(waitMs / 60000)} min)`);

  while (remaining > 0) {
    process.stdout.write(
      `\r⏱️  Next comment in ${Math.floor(remaining / 60)}m ${remaining % 60}s `
    );
    await new Promise(r => setTimeout(r, 1000));
    remaining--;
  }

  process.stdout.write("\n✅ Cooldown finished\n");
}
