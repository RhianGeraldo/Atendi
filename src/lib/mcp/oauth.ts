import crypto from "crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * Metadata para Descoberta de Recursos Protegidos (RFC 9728)
 * Utilizado por Claude.ai e outros clientes MCP para descobrir o servidor OAuth.
 */
export function getOauthProtectedResourceMetadata(origin: string) {
  return {
    resource: `${origin}/mcp`,
    authorization_servers: [
      origin,
      process.env.VITE_SUPABASE_URL ? `${process.env.VITE_SUPABASE_URL}/auth/v1` : undefined,
    ].filter(Boolean),
    scopes_supported: ["openid", "profile", "email", "mcp:all", "offline_access"],
    bearer_methods_supported: ["header"],
    resource_name: "AtendiAI",
  };
}

/**
 * Metadata do Servidor de Autorização OAuth 2.1 (RFC 8414 / OpenID Connect)
 */
export function getOauthAuthorizationServerMetadata(origin: string) {
  return {
    issuer: origin,
    authorization_endpoint: `${origin}/oauth/authorize`,
    token_endpoint: `${origin}/api/oauth/token`,
    registration_endpoint: `${origin}/api/oauth/register`,
    jwks_uri: `${origin}/.well-known/jwks.json`,
    scopes_supported: ["openid", "profile", "email", "mcp:all", "offline_access"],
    response_types_supported: ["code"],
    response_modes_supported: ["query"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256", "plain"],
    token_endpoint_auth_methods_supported: ["client_secret_basic", "client_secret_post", "none"],
  };
}

/**
 * Dynamic Client Registration (RFC 7591)
 * Permite que o Claude.ai se auto-registre sem configuração manual prévia.
 */
export async function handleOauthRegister(request: Request): Promise<Response> {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    const body = await request.json();
    const clientName = body.client_name || "Cliente MCP";
    const redirectUris = Array.isArray(body.redirect_uris) ? body.redirect_uris : [];

    if (!redirectUris.length) {
      return new Response(
        JSON.stringify({ error: "invalid_client_metadata", error_description: "redirect_uris é obrigatório" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const clientId = `atendi_oauth_${crypto.randomBytes(16).toString("hex")}`;
    const clientSecret = `sec_${crypto.randomBytes(32).toString("hex")}`;

    const { error } = await supabaseAdmin.from("mcp_oauth_clients").insert({
      client_id: clientId,
      client_secret: clientSecret,
      client_name: clientName,
      redirect_uris: redirectUris,
      client_type: "confidential",
    });

    if (error) {
      console.error("[OAuth] Erro ao cadastrar cliente:", error);
      return new Response(
        JSON.stringify({ error: "server_error", error_description: "Não foi possível registrar o conector." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        client_name: clientName,
        redirect_uris: redirectUris,
        grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"],
        token_endpoint_auth_method: "client_secret_basic",
        client_type: "confidential",
      }),
      { status: 201, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: "invalid_request", error_description: err.message }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
}

/**
 * Token Exchange Endpoint (RFC 6749 / RFC 7636 PKCE)
 * Troca o código de autorização por access token e refresh token.
 */
export async function handleOauthToken(request: Request): Promise<Response> {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    let grantType = "";
    let code = "";
    let redirectUri = "";
    let codeVerifier = "";
    let refreshTokenParam = "";

    const contentType = request.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      const json = await request.json();
      grantType = json.grant_type;
      code = json.code;
      redirectUri = json.redirect_uri;
      codeVerifier = json.code_verifier;
      refreshTokenParam = json.refresh_token;
    } else {
      const formData = await request.formData();
      grantType = (formData.get("grant_type") as string) || "";
      code = (formData.get("code") as string) || "";
      redirectUri = (formData.get("redirect_uri") as string) || "";
      codeVerifier = (formData.get("code_verifier") as string) || "";
      refreshTokenParam = (formData.get("refresh_token") as string) || "";
    }

    // 1. Fluxo de Troca de Código (authorization_code)
    if (grantType === "authorization_code") {
      if (!code) {
        return new Response(
          JSON.stringify({ error: "invalid_request", error_description: "Parâmetro 'code' ausente." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { data: codeRow, error: codeErr } = await supabaseAdmin
        .from("mcp_oauth_codes")
        .select("*")
        .eq("code", code)
        .is("used_at", null)
        .gt("expires_at", new Date().toISOString())
        .single();

      if (codeErr || !codeRow) {
        return new Response(
          JSON.stringify({ error: "invalid_grant", error_description: "Código de autorização inválido ou expirado." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Validação PKCE se o code_challenge tiver sido enviado
      if (codeRow.code_challenge) {
        if (!codeVerifier) {
          return new Response(
            JSON.stringify({ error: "invalid_grant", error_description: "code_verifier é obrigatório para PKCE." }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        if (codeRow.code_challenge_method === "S256") {
          const computedHash = crypto
            .createHash("sha256")
            .update(codeVerifier)
            .digest("base64url");

          if (computedHash !== codeRow.code_challenge) {
            return new Response(
              JSON.stringify({ error: "invalid_grant", error_description: "Falha na verificação PKCE (S256 mismatch)." }),
              { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
        } else if (codeRow.code_challenge_method === "plain") {
          if (codeVerifier !== codeRow.code_challenge) {
            return new Response(
              JSON.stringify({ error: "invalid_grant", error_description: "Falha na verificação PKCE (plain mismatch)." }),
              { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
        }
      }

      // Marcar código como utilizado
      await supabaseAdmin
        .from("mcp_oauth_codes")
        .update({ used_at: new Date().toISOString() })
        .eq("code", code);

      // Gerar Access Token e Refresh Token
      const accessToken = `atendi_mcp_oauth_${crypto.randomBytes(32).toString("hex")}`;
      const refreshToken = `atendi_mcp_refresh_${crypto.randomBytes(32).toString("hex")}`;
      const expiresInSeconds = 30 * 24 * 60 * 60; // 30 dias de validade
      const expiresAt = new Date(Date.now() + expiresInSeconds * 1000).toISOString();

      await supabaseAdmin.from("mcp_oauth_tokens").insert({
        access_token: accessToken,
        refresh_token: refreshToken,
        client_id: codeRow.client_id,
        user_id: codeRow.user_id,
        company_id: codeRow.company_id,
        unit_id: codeRow.unit_id,
        scope: codeRow.scope || "openid mcp:all",
        expires_at: expiresAt,
      });

      return new Response(
        JSON.stringify({
          access_token: accessToken,
          token_type: "Bearer",
          expires_in: expiresInSeconds,
          refresh_token: refreshToken,
          scope: codeRow.scope || "openid mcp:all",
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Fluxo de Refresh Token
    if (grantType === "refresh_token") {
      if (!refreshTokenParam) {
        return new Response(
          JSON.stringify({ error: "invalid_request", error_description: "Parâmetro 'refresh_token' ausente." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { data: tokenRow, error: tokenErr } = await supabaseAdmin
        .from("mcp_oauth_tokens")
        .select("*")
        .eq("refresh_token", refreshTokenParam)
        .single();

      if (tokenErr || !tokenRow) {
        return new Response(
          JSON.stringify({ error: "invalid_grant", error_description: "Refresh token inválido." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const newAccessToken = `atendi_mcp_oauth_${crypto.randomBytes(32).toString("hex")}`;
      const newRefreshToken = `atendi_mcp_refresh_${crypto.randomBytes(32).toString("hex")}`;
      const expiresInSeconds = 30 * 24 * 60 * 60;
      const expiresAt = new Date(Date.now() + expiresInSeconds * 1000).toISOString();

      await supabaseAdmin
        .from("mcp_oauth_tokens")
        .update({
          access_token: newAccessToken,
          refresh_token: newRefreshToken,
          expires_at: expiresAt,
        })
        .eq("refresh_token", refreshTokenParam);

      return new Response(
        JSON.stringify({
          access_token: newAccessToken,
          token_type: "Bearer",
          expires_in: expiresInSeconds,
          refresh_token: newRefreshToken,
          scope: tokenRow.scope || "openid mcp:all",
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: "unsupported_grant_type", error_description: "Tipo de concessão não suportado." }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("[OAuth] Erro no token endpoint:", err);
    return new Response(
      JSON.stringify({ error: "server_error", error_description: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
}

/**
 * Interface visual de consentimento e login para /oauth/authorize
 */
export async function handleOauthAuthorize(request: Request): Promise<Response> {
  const url = new URL(request.url);

  // GET: Renderizar tela de login e consentimento da AtendiAI
  if (request.method === "GET") {
    const clientId = url.searchParams.get("client_id") || "atendi-claude-mcp";
    const redirectUri = url.searchParams.get("redirect_uri") || "https://claude.ai/api/mcp/oauth/callback";
    const state = url.searchParams.get("state") || "";
    const codeChallenge = url.searchParams.get("code_challenge") || "";
    const codeChallengeMethod = url.searchParams.get("code_challenge_method") || "S256";
    const scope = url.searchParams.get("scope") || "openid mcp:all";

    const html = `<!DOCTYPE html>
<html lang="pt-BR" class="dark">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Conectar Claude à AtendiAI</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <script>
    tailwind.config = {
      darkMode: 'class',
      theme: {
        extend: {
          colors: {
            brand: {
              50: '#f5f3ff',
              500: '#8b5cf6',
              600: '#7c3aed',
              700: '#6d28d9',
            }
          }
        }
      }
    }
  </script>
</head>
<body class="bg-slate-950 text-slate-100 min-h-screen flex items-center justify-center p-4 antialiased">
  <div class="max-w-md w-full bg-slate-900 border border-slate-800 rounded-2xl p-6 md:p-8 shadow-2xl relative overflow-hidden">
    <div class="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-violet-600 via-indigo-500 to-purple-600"></div>

    <div class="flex items-center justify-center space-x-3 mb-6">
      <div class="w-10 h-10 rounded-xl bg-violet-600/20 border border-violet-500/30 flex items-center justify-center text-violet-400 font-bold text-lg">
        ⚡
      </div>
      <div class="text-xl font-bold tracking-tight">AtendiAI <span class="text-xs font-normal text-violet-400 border border-violet-500/30 px-2 py-0.5 rounded-full ml-1">MCP</span></div>
    </div>

    <div class="text-center mb-6">
      <h1 class="text-xl font-semibold text-white mb-1">Autorizar Claude.ai</h1>
      <p class="text-sm text-slate-400">O conector Claude.ai solicita permissão para interagir com o seu CRM multi-unidade.</p>
    </div>

    <div class="bg-slate-950/60 border border-slate-800/80 rounded-xl p-4 mb-6 text-xs text-slate-300 space-y-2">
      <div class="font-medium text-slate-200 mb-1 flex items-center gap-1.5">
        <span class="w-2 h-2 rounded-full bg-emerald-500"></span> Permissões concedidas:
      </div>
      <div class="flex items-center gap-2">✓ Consultar unidades (Matriz e Filiais)</div>
      <div class="flex items-center gap-2">✓ Gerenciar e consultar contatos e conversas</div>
      <div class="flex items-center gap-2">✓ Consultar pipelines, etapas e oportunidades</div>
      <div class="flex items-center gap-2">✓ Acessar tarefas e Playbook Comercial</div>
      <div class="flex items-center gap-2">✓ Consultar métricas de conversão e faturamento</div>
    </div>

    <form method="POST" action="/oauth/authorize" class="space-y-4">
      <input type="hidden" name="client_id" value="${escapeHtml(clientId)}" />
      <input type="hidden" name="redirect_uri" value="${escapeHtml(redirectUri)}" />
      <input type="hidden" name="state" value="${escapeHtml(state)}" />
      <input type="hidden" name="code_challenge" value="${escapeHtml(codeChallenge)}" />
      <input type="hidden" name="code_challenge_method" value="${escapeHtml(codeChallengeMethod)}" />
      <input type="hidden" name="scope" value="${escapeHtml(scope)}" />

      <div>
        <label class="block text-xs font-medium text-slate-300 mb-1.5">E-mail de acesso AtendiAI</label>
        <input 
          type="email" 
          name="email" 
          required 
          placeholder="seu-email@empresa.com"
          class="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-violet-500 transition"
        />
      </div>

      <div>
        <label class="block text-xs font-medium text-slate-300 mb-1.5">Sua senha</label>
        <input 
          type="password" 
          name="password" 
          required 
          placeholder="••••••••"
          class="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-violet-500 transition"
        />
      </div>

      <div>
        <label class="block text-xs font-medium text-slate-300 mb-1.5">Escopo de Unidade (Opcional)</label>
        <select 
          name="unit_selection" 
          class="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-violet-500 transition"
        >
          <option value="">Acesso Geral da Empresa (Matriz + Todas as Filiais)</option>
        </select>
        <p class="text-[10px] text-slate-500 mt-1">O Claude respeitará as unidades às quais seu usuário tem acesso.</p>
      </div>

      <div class="pt-2 flex flex-col gap-2">
        <button 
          type="submit" 
          class="w-full bg-violet-600 hover:bg-violet-500 text-white font-medium py-2.5 px-4 rounded-lg transition duration-150 flex items-center justify-center gap-2 shadow-lg shadow-violet-600/20"
        >
          <span>Autorizar Acesso</span>
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 5l7 7m0 0l-7 7m7-7H3"/></svg>
        </button>
        <a 
          href="${escapeHtml(redirectUri)}?error=access_denied&state=${escapeHtml(state)}"
          class="w-full text-center text-xs text-slate-500 hover:text-slate-400 py-1.5 transition"
        >
          Cancelar e voltar
        </a>
      </div>
    </form>
  </div>
</body>
</html>`;

    return new Response(html, {
      status: 200,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  // POST: Processar credenciais e emitir código de autorização
  if (request.method === "POST") {
    try {
      const formData = await request.formData();
      const email = (formData.get("email") as string)?.trim();
      const password = (formData.get("password") as string)?.trim();
      const clientId = (formData.get("client_id") as string) || "atendi-claude-mcp";
      const redirectUri = (formData.get("redirect_uri") as string) || "https://claude.ai/api/mcp/oauth/callback";
      const state = (formData.get("state") as string) || "";
      const codeChallenge = (formData.get("code_challenge") as string) || "";
      const codeChallengeMethod = (formData.get("code_challenge_method") as string) || "S256";
      const scope = (formData.get("scope") as string) || "openid mcp:all";
      const unitSelection = (formData.get("unit_selection") as string) || null;

      if (!email || !password) {
        return renderAuthErrorPage("E-mail e senha são obrigatórios.", redirectUri, state);
      }

      // 1. Autenticar usuário via Supabase Auth
      const { data: authData, error: authErr } = await supabaseAdmin.auth.signInWithPassword({
        email,
        password,
      });

      if (authErr || !authData.user) {
        return renderAuthErrorPage(
          "Credenciais inválidas. Verifique seu e-mail e senha da AtendiAI.",
          redirectUri,
          state
        );
      }

      const userId = authData.user.id;

      // 2. Buscar perfil e empresa ativa do usuário
      const { data: profile } = await supabaseAdmin
        .from("profiles")
        .select("company_id, name, email")
        .eq("id", userId)
        .single();

      const companyId = profile?.company_id;
      if (!companyId) {
        return renderAuthErrorPage(
          "Nenhuma empresa associada a esta conta no AtendiAI.",
          redirectUri,
          state
        );
      }

      // 3. Gerar código de autorização único
      const code = `atendi_code_${crypto.randomBytes(24).toString("hex")}`;
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10 minutos

      // 4. Salvar código no banco
      const { error: insertErr } = await supabaseAdmin.from("mcp_oauth_codes").insert({
        code,
        client_id: clientId,
        user_id: userId,
        company_id: companyId,
        unit_id: unitSelection || null,
        code_challenge: codeChallenge || null,
        code_challenge_method: codeChallengeMethod || "S256",
        redirect_uri: redirectUri,
        scope,
        expires_at: expiresAt,
      });

      if (insertErr) {
        console.error("[OAuth] Erro ao salvar code:", insertErr);
        return renderAuthErrorPage("Falha interna ao gerar código de autorização.", redirectUri, state);
      }

      // 5. Redirecionar para o callback do Claude.ai
      const callbackUrl = new URL(redirectUri);
      callbackUrl.searchParams.set("code", code);
      if (state) callbackUrl.searchParams.set("state", state);

      return new Response(null, {
        status: 302,
        headers: {
          Location: callbackUrl.toString(),
        },
      });
    } catch (err: any) {
      console.error("[OAuth] Erro no processamento de autorização:", err);
      return renderAuthErrorPage(err.message, "https://claude.ai", "");
    }
  }

  return new Response("Método não permitido", { status: 405 });
}

function renderAuthErrorPage(message: string, redirectUri: string, state: string): Response {
  const html = `<!DOCTYPE html>
<html lang="pt-BR" class="dark">
<head>
  <meta charset="UTF-8">
  <title>Erro de Autenticação - AtendiAI</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-slate-950 text-slate-100 min-h-screen flex items-center justify-center p-4">
  <div class="max-w-md w-full bg-slate-900 border border-rose-900/50 rounded-2xl p-6 text-center shadow-2xl">
    <div class="w-12 h-12 rounded-full bg-rose-500/20 text-rose-400 flex items-center justify-center mx-auto mb-4 text-2xl font-bold">⚠️</div>
    <h2 class="text-lg font-semibold text-white mb-2">Não foi possível autorizar</h2>
    <p class="text-sm text-slate-300 mb-6">${escapeHtml(message)}</p>
    <a href="javascript:history.back()" class="inline-block bg-slate-800 hover:bg-slate-700 text-white text-xs font-medium py-2 px-4 rounded-lg transition mr-2">Tentar novamente</a>
    <a href="${escapeHtml(redirectUri)}?error=access_denied&state=${escapeHtml(state)}" class="inline-block bg-rose-600 hover:bg-rose-500 text-white text-xs font-medium py-2 px-4 rounded-lg transition">Cancelar</a>
  </div>
</body>
</html>`;

  return new Response(html, {
    status: 400,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

function escapeHtml(str: string): string {
  return (str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
