/**
 * O WhatsApp do canal (EvoGo / Stevo) está conectado?
 *
 * Com o aparelho desconectado, o EvoGo não recusa o envio: ele segura a
 * requisição até o timeout, e o atendente via "The operation was aborted due to
 * timeout" depois de mais de um minuto, sem saber o que fazer. Aqui se pergunta
 * ao provedor o estado da sessão, para trocar esse erro por um aviso claro e
 * marcar o canal como desconectado na lista de canais.
 */

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { CanalAberto } from "../canais/tipos";

export type EstadoDaConexao = "conectado" | "desconectado" | "sem_resposta";

const TIMEOUT_STATUS_MS = 6000;

/** Mesmas formas de resposta que a tela de Unidades já reconhece. */
function respostaConectada(res: any): boolean {
  const d = res?.data ?? res;
  return (
    res?.instance?.state === "open" ||
    res?.instance?.status === "open" ||
    d?.instance?.state === "open" ||
    res?.state === "open" ||
    (d?.Connected === true && d?.LoggedIn === true) ||
    (res?.Connected === true && res?.LoggedIn === true)
  );
}

export async function consultarConexao(canal: Pick<CanalAberto, "host" | "token">): Promise<EstadoDaConexao> {
  if (!canal.host || !canal.token) return "sem_resposta";
  const baseUrl = canal.host.replace(/\/$/, "");
  try {
    const res = await fetch(`${baseUrl}/instance/status`, {
      headers: { apikey: canal.token, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(TIMEOUT_STATUS_MS),
    });
    const texto = await res.text();
    if (!res.ok) {
      // Sessão inexistente ou deslogada responde com erro, não com Connected: false.
      if (res.status === 404 || /logged|logout|disconnect|not connected|no session|not found/i.test(texto)) {
        return "desconectado";
      }
      return "sem_resposta";
    }
    let json: any = null;
    try {
      json = JSON.parse(texto);
    } catch {
      return "sem_resposta";
    }
    return respostaConectada(json) ? "conectado" : "desconectado";
  } catch {
    return "sem_resposta";
  }
}

async function gravarStatus(canalId: string, status: "connected" | "disconnected") {
  const { error } = await supabaseAdmin.from("whatsapp_instances").update({ status }).eq("id", canalId);
  if (error) console.error(`[whatsapp-conexao] Falha ao gravar status ${status} do canal ${canalId}:`, error);
}

function nomeDoProvedor(canal: CanalAberto) {
  return canal.provedor === "stevo" ? "Stevo" : "EvoGo";
}

function avisoDesconectado(canal: CanalAberto) {
  return new Error(
    `O WhatsApp do canal "${canal.nome || canal.instanceName}" está desconectado. ` +
      "Reconecte lendo o QR Code em Configurações → Canais e envie a mensagem de novo.",
  );
}

function avisoSemResposta(canal: CanalAberto) {
  return new Error(
    `O servidor ${nomeDoProvedor(canal)} do canal "${canal.nome || canal.instanceName}" não respondeu. ` +
      "O WhatsApp pode estar desconectado ou o servidor fora do ar. Confira o canal em Configurações → Canais.",
  );
}

/**
 * Antes de enviar: só consulta o provedor quando o canal já está marcado como
 * desconectado, para não esperar um minuto por um envio que não vai sair. Se o
 * aparelho voltou, corrige o status e deixa o envio seguir.
 */
export async function garantirConexaoWhatsApp(canal: CanalAberto): Promise<void> {
  if (canal.status !== "disconnected") return;
  const estado = await consultarConexao(canal);
  if (estado === "conectado") {
    await gravarStatus(canal.id, "connected");
    return;
  }
  if (estado === "desconectado") throw avisoDesconectado(canal);
  throw avisoSemResposta(canal);
}

/** O envio falhou: descobre se foi a conexão e devolve o erro que o atendente entende. */
export async function explicarFalhaDeEnvio(canal: CanalAberto, erro: unknown): Promise<Error> {
  const original = erro instanceof Error ? erro : new Error(String(erro));
  const estado = await consultarConexao(canal);
  if (estado === "desconectado") {
    await gravarStatus(canal.id, "disconnected");
    return avisoDesconectado(canal);
  }
  if (estado === "sem_resposta") return avisoSemResposta(canal);
  if (canal.status === "disconnected") await gravarStatus(canal.id, "connected");
  // Conectado: o problema é outro (número, mídia, conteúdo). Mantém o erro original.
  return original;
}

/**
 * Eventos de conexão que o EvoGo / Stevo mandam no webhook (formato whatsmeow:
 * `{ event, data, instanceToken, instanceId, instanceName }`).
 *
 * - `Connected` / `PairSuccess`: sessão ativa.
 * - `LoggedOut`: o aparelho saiu (desconectou pelo celular, trocou de aparelho):
 *   só volta lendo o QR Code de novo.
 * - `ConnectFailure`: conta só quando o motivo é sessão perdida ou banimento;
 *   erro de servidor do WhatsApp é passageiro e o EvoGo tenta de novo sozinho.
 * - `TemporaryBan`: o número não envia até o banimento acabar.
 * - `Disconnected` fica de fora de propósito: é o websocket caindo, e o EvoGo
 *   reconecta em segundos. Marcar o canal acenderia a faixa vermelha à toa.
 * - `connection.update` é o mesmo aviso no formato Baileys / Evolution API.
 */
const MOTIVO_DE_SESSAO_PERDIDA = /logged.?out|main device gone|unknown logout|ban|outdated|401|402|403|406/i;

function estadoDoEvento(body: any): "connected" | "disconnected" | null {
  const evento = String(body?.event ?? "");
  const data = body?.data ?? {};
  switch (evento) {
    case "Connected":
    case "PairSuccess":
      return "connected";
    case "LoggedOut":
    case "TemporaryBan":
      return "disconnected";
    case "ConnectFailure":
      return MOTIVO_DE_SESSAO_PERDIDA.test(String(data.reason ?? data.Reason ?? "")) ? "disconnected" : null;
    case "connection.update":
    case "CONNECTION_UPDATE": {
      if (data.state === "open") return "connected";
      if (data.state === "close" && MOTIVO_DE_SESSAO_PERDIDA.test(String(data.statusReason ?? ""))) return "disconnected";
      return null;
    }
    default:
      return null;
  }
}

/**
 * Atualiza o status do canal a partir de um evento de conexão. Retorna `true`
 * quando o evento era de conexão (tratado ou ignorado), para o webhook parar ali.
 */
export async function atualizarStatusPeloWebhook(provedor: "evogo" | "stevo", body: any): Promise<boolean> {
  const evento = String(body?.event ?? "");
  const eventosDeConexao = [
    "Connected",
    "PairSuccess",
    "LoggedOut",
    "TemporaryBan",
    "ConnectFailure",
    "Disconnected",
    "connection.update",
    "CONNECTION_UPDATE",
  ];
  if (!eventosDeConexao.includes(evento)) return false;

  const novo = estadoDoEvento(body);
  const nomeDaInstancia = body?.instanceName || body?.instance || null;
  console.log(
    `[${provedor}-webhook] Conexão: ${evento} da instância ${nomeDaInstancia ?? body?.instanceId ?? "?"}` +
      (body?.data?.reason ? ` (motivo: ${body.data.reason})` : "") +
      (novo ? ` -> ${novo}` : " -> sem mudança"),
  );
  if (!novo) return true;

  // O token e o id da instância no provedor identificam sem ambiguidade; o nome
  // pode se repetir entre empresas com hosts diferentes. Consultas separadas,
  // com .eq, porque o valor vem de fora e não pode entrar num filtro .or().
  const colunaToken = provedor === "stevo" ? "stevo_api_key" : "evogo_api_key";
  const colunaId = provedor === "stevo" ? "stevo_instance_id" : "evogo_instance_id";
  const tentativas: [string, unknown][] = [
    [colunaToken, body?.instanceToken],
    [colunaId, body?.instanceId],
    ["instance_name", nomeDaInstancia],
  ];

  let canal: { id: string; status: string | null } | null = null;
  for (const [coluna, valor] of tentativas) {
    if (typeof valor !== "string" || !valor) continue;
    const { data } = await supabaseAdmin
      .from("whatsapp_instances")
      .select("id, status")
      .eq("provider", provedor)
      .eq(coluna, valor)
      .limit(2);
    if (data?.length === 1) {
      canal = data[0];
      break;
    }
  }
  if (!canal) {
    console.warn(`[${provedor}-webhook] Evento ${evento} de instância que não está cadastrada no Atendi.`);
    return true;
  }

  const update: { status?: string; owner_jid?: string } = {};
  if (canal.status !== novo) update.status = novo;
  // Mesmo formato que a tela de Unidades grava: só o número.
  const jid = novo === "connected" ? String(body?.data?.jid ?? body?.data?.ID ?? "") : "";
  const numero = jid.split("@")[0].split(":")[0];
  if (numero && /^\d+$/.test(numero)) update.owner_jid = numero;

  if (Object.keys(update).length) {
    const { error } = await supabaseAdmin.from("whatsapp_instances").update(update).eq("id", canal.id);
    if (error) console.error(`[${provedor}-webhook] Falha ao gravar o status do canal ${canal.id}:`, error);
  }
  return true;
}
