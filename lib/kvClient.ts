type KvCommand = Array<string | number>;
type KvPipelineResult = Array<{ result: unknown; error?: string }>;

function getKvConfig(): { url: string; token: string } | null {
  const url   = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) return null;
  return { url, token };
}

export async function kvPipeline(commands: KvCommand[]): Promise<KvPipelineResult> {
  const cfg = getKvConfig();
  if (!cfg) return commands.map(() => ({ result: null }));

  const res = await fetch(`${cfg.url}/pipeline`, {
    method:  'POST',
    headers: {
      'Authorization': `Bearer ${cfg.token}`,
      'Content-Type':  'application/json',
    },
    body:  JSON.stringify(commands),
    cache: 'no-store',
  });

  if (!res.ok) throw new Error(`KV pipeline failed: HTTP ${res.status}`);
  return res.json();
}

export function kvAvailable(): boolean {
  return getKvConfig() !== null;
}
