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
