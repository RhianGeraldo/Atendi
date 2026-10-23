/**
 * Dono da conversa no Instagram (protocolo de passagem de conversa da Meta).
 *
 * Só o app dono da conversa pode responder. A Caixa de entrada do Meta Business
 * Suite vira dona quando alguém responde por lá ou pelo app do Instagram, ou
 * quando a unidade tem automação ativa (resposta instantânea, ausência). A Meta
 * recusa o envio com "(#100) ... não é a dona do tópico / not the thread owner".
 */

export function erroDeDonoDaConversa(result: any): boolean {
  const err = result?.error;
  if (!err || err.code !== 100) return false;
  return /thread owner|dona do t[óo]pico|propriet[áa]rio do t[óo]pico/i.test(String(err.message ?? ""));
}

/**
 * Pede a conversa de volta para o app. Funciona quando o Atendi é o destinatário
 * principal da conta; se outro app for o principal, a Meta recusa.
 */
export async function pegarConversaDeVolta(params: {
  pageId: string;
  token: string;
  igsid: string;
}): Promise<{ ok: boolean; erro?: string }> {
  try {
    const res = await fetch(
      `https://graph.facebook.com/v20.0/${params.pageId}/take_thread_control?access_token=${params.token}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipient: { id: params.igsid }, metadata: "atendi" }),
      },
    );
    const json = await res.json().catch(() => ({}));
    if (!res.ok || json?.error) return { ok: false, erro: json?.error?.message || `HTTP ${res.status}` };
    return { ok: true };
  } catch (e: any) {
    return { ok: false, erro: e?.message || String(e) };
  }
}

export const MENSAGEM_SEM_DONO_DA_CONVERSA =
  "Outro app ou a Caixa de entrada do Meta Business Suite está com esta conversa do Instagram, " +
  'e o Atendi não conseguiu retomá-la. Na Página da unidade, em Configurações > Mensagens avançadas (Instagram), ' +
  'defina "Erriesse - Messages" como destinatário principal e desative as automações do Business Suite ' +
  "(resposta instantânea, mensagem de ausência, perguntas frequentes).";
