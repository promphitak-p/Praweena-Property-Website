export async function linePush(to, messages) {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!token) throw new Error('LINE_CHANNEL_ACCESS_TOKEN missing');

  const payload = Array.isArray(messages) ? messages : [messages];

  const res = await fetch('https://api.line.me/v2/bot/message/push', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ to, messages: payload }),
  });

  if (!res.ok) {
    const t = await res.text();
    throw new Error(`LINE push failed: ${res.status} ${t}`);
  }
}
