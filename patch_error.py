import re

with open('src/lib/server/evogo-webhook.ts', 'r') as f:
    content = f.read()

content = content.replace(
    "processEvogoWebhookBody(body).catch((err) => console.error('Webhook background error:', err));",
    "processEvogoWebhookBody(body).catch((err) => { console.error('Webhook background error:', err); fs.appendFileSync('webhook_logs.txt', new Date().toISOString() + ' BG ERROR: ' + String(err.stack || err) + '\\n'); });"
)

with open('src/lib/server/evogo-webhook.ts', 'w') as f:
    f.write(content)
