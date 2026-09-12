import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

import { handleEvogoWebhook } from "./lib/server/evogo-webhook";
import { handleWavoipWebhook } from "./lib/server/wavoip-webhook";
import { handleCronFollowUps } from "./lib/server/cron";

// Auto-trigger cron jobs every 1 minute while server is running
let cronIntervalStarted = false;
if (typeof global !== 'undefined') {
  if (!(global as any).__cronStarted) {
    (global as any).__cronStarted = true;
    console.log('[cron] Auto-trigger interval started (every 1 minute)');
    setInterval(() => {
      const mockReq = new Request('http://localhost/api/cron/follow-ups?secret=atendi-cron-secret-123');
      handleCronFollowUps(mockReq).catch(err => console.error('[cron] Auto-trigger error:', err));
    }, 60 * 1000);
  }
}

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!body.includes('"unhandled":true') || !body.includes('"message":"HTTPError"')) {
    return response;
  }

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    try {
      const url = new URL(request.url);
      
      // Webhooks padronizados
      if (url.pathname === '/api/webhooks/evogo' && request.method === 'POST') {
        return await handleEvogoWebhook(request);
      }
      
      // Retrocompatibilidade para quem já configurou o webhook na Evogo
      if (url.pathname === '/api/evogo/webhook' && request.method === 'POST') {
        return await handleEvogoWebhook(request);
      }

      if (url.pathname === '/api/webhooks/whatsapp' && (request.method === 'POST' || request.method === 'GET')) {
        const { handleWhatsappCloudWebhook } = await import('./lib/server/whatsapp-cloud-webhook');
        return await handleWhatsappCloudWebhook(request);
      }

      if (url.pathname === '/api/webhooks/facebook' && (request.method === 'POST' || request.method === 'GET')) {
        const { handleFacebookWebhook } = await import('./lib/server/facebook-webhook');
        return await handleFacebookWebhook(request);
      }

      if (url.pathname === '/api/webhooks/instagram' && (request.method === 'POST' || request.method === 'GET')) {
        const { handleInstagramWebhook } = await import('./lib/server/instagram-webhook');
        return await handleInstagramWebhook(request);
      }

      if (url.pathname === '/api/webhooks/messenger' && (request.method === 'POST' || request.method === 'GET')) {
        const { handleMessengerWebhook } = await import('./lib/server/messenger-webhook');
        return await handleMessengerWebhook(request);
      }

      if ((url.pathname === '/api/webhooks/stevochat' || url.pathname === '/api/webhooks/stevo') && request.method === 'POST') {
        const { handleStevoWebhook } = await import('./lib/server/stevo-webhook');
        return await handleStevoWebhook(request);
      }

      if (url.pathname.startsWith('/api/webhooks/zernio') && request.method === 'POST') {
        const { handleZernioWebhook } = await import('./lib/server/zernio-webhook');
        return await handleZernioWebhook(request);
      }

      // Outros webhooks
      if (url.pathname === '/api/wavoip/webhook' && request.method === 'POST') {
        return await handleWavoipWebhook(request);
      }
      if (url.pathname === '/api/cron/follow-ups') {
        return await handleCronFollowUps(request);
      }

      // Descoberta de Recursos Protegidos OAuth 2.0 (RFC 9728) para Claude.ai / MCP
      if (url.pathname === '/.well-known/oauth-protected-resource' || url.pathname === '/.well-known/oauth-protected-resource/mcp') {
        const { getOauthProtectedResourceMetadata } = await import('./lib/mcp/oauth');
        return new Response(JSON.stringify(getOauthProtectedResourceMetadata(url.origin)), {
          status: 200,
          headers: {
            "Content-Type": "application/json; charset=utf-8",
            "Access-Control-Allow-Origin": "*",
          },
        });
      }

      // Descoberta do Servidor de Autorização OAuth 2.0 / OIDC (RFC 8414)
      if (url.pathname === '/.well-known/oauth-authorization-server' || url.pathname === '/.well-known/openid-configuration') {
        const { getOauthAuthorizationServerMetadata } = await import('./lib/mcp/oauth');
        return new Response(JSON.stringify(getOauthAuthorizationServerMetadata(url.origin)), {
          status: 200,
          headers: {
            "Content-Type": "application/json; charset=utf-8",
            "Access-Control-Allow-Origin": "*",
          },
        });
      }

      // Registro Dinâmico de Clientes OAuth 2.0 (RFC 7591)
      if (url.pathname === '/api/oauth/register') {
        const { handleOauthRegister } = await import('./lib/mcp/oauth');
        return await handleOauthRegister(request);
      }

      // Troca de Token OAuth 2.1 (RFC 6749 / PKCE)
      if (url.pathname === '/api/oauth/token') {
        const { handleOauthToken } = await import('./lib/mcp/oauth');
        return await handleOauthToken(request);
      }

      // Tela de Login e Consentimento OAuth 2.1
      if (url.pathname === '/oauth/authorize') {
        const { handleOauthAuthorize } = await import('./lib/mcp/oauth');
        return await handleOauthAuthorize(request);
      }

      // Endpoint oficial do Model Context Protocol (MCP)
      if (url.pathname === '/api/mcp' || url.pathname === '/mcp') {
        const { handleMcpRequest } = await import('./lib/mcp/handler');
        return await handleMcpRequest(request);
      }

      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      return await normalizeCatastrophicSsrResponse(response);
    } catch (error) {
      console.error(error);
      return new Response(renderErrorPage(), {
        status: 500,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
  },
};
