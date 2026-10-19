// Prints the opt-in "can we contact you for your story?" emails collected by
// /api/feedback (newest first). Reads Upstash credentials from the
// environment or .env.local — pull them with `vercel env pull .env.local`.
//
//   npm run feedback:contacts
import { getStore, isDurable } from '../src/lib/kv';

try {
  process.loadEnvFile('.env.local');
} catch {
  // No .env.local — rely on the existing environment.
}

async function main() {
  if (!isDurable()) {
    console.error('Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN (or KV_REST_API_*) first.');
    process.exit(1);
  }
  const rows = await getStore().lrange('feedback:contacts', 0, -1);
  if (rows.length === 0) console.log('No contacts yet.');
  for (const row of rows) {
    const { email, context, at } = JSON.parse(row) as { email: string; context: string; at: string };
    console.log(`${at}\t${context}\t${email}`);
  }
}

main();
