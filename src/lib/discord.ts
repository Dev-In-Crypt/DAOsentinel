/**
 * Discord webhook delivery. Unlike Telegram this needs no bot token or API key
 * — a user creates an Incoming Webhook in their own server and pastes the URL.
 * So per-user delivery works fully without any platform credential.
 */

const DISCORD_WEBHOOK_RE =
  /^https:\/\/(?:canary\.|ptb\.)?discord(?:app)?\.com\/api\/webhooks\/\d+\/[\w-]+$/;

export function isValidDiscordWebhook(url: string): boolean {
  return DISCORD_WEBHOOK_RE.test(url.trim());
}

export interface DiscordAlert {
  title: string;
  description: string;
  url?: string;
  severity?: 'info' | 'warning' | 'critical';
}

function colorFor(sev?: string): number {
  if (sev === 'critical') return 0xfb7185; // rose
  if (sev === 'warning') return 0xf59e0b; // amber
  return 0x818cf8; // indigo
}

/** Post an embed to a Discord webhook. Returns false on any failure. */
export async function sendDiscordAlert(webhookUrl: string, alert: DiscordAlert): Promise<boolean> {
  if (!isValidDiscordWebhook(webhookUrl)) return false;
  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        username: 'DAO Sentinel',
        embeds: [
          {
            title: alert.title.slice(0, 256),
            description: alert.description.slice(0, 2000),
            url: alert.url,
            color: colorFor(alert.severity),
          },
        ],
      }),
    });
    return res.ok;
  } catch (e) {
    console.warn('[discord] webhook post failed', (e as Error).message);
    return false;
  }
}
