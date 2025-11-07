// /js/services/loggerService.js
export function logInfo(source, message, meta)  { return send('info',  source, message, meta); }
export function logWarn(source, message, meta)  { return send('warn',  source, message, meta); }
export function logError(source, message, meta) { return send('error', source, message, meta); }

async function send(level, source, message, meta) {
  try {
    await fetch('/api/log', {
      method:'POST',
      headers:{ 'Content-Type':'application/json' },
      body: JSON.stringify({ level, source, message, meta })
    });
  } catch(e) { /* no-op */ }
}
