/**
 * Onde se descobre por qual canal uma conversa fala.
 *
 * Este arquivo existe para substituir um bloco de ~160 linhas que estava
 * duplicado, palavra por palavra, em `chat.functions.ts` (o envio de gente) e
 * em `message-sender.ts` (o envio da IA). Além de duplicado, ele deduzia o
 * provedor a partir do `channel` da conversa — e essa dedução é o que impede
 * um provedor de atender duas redes.
 *
 * **A inversão:** quem manda é a instância gravada na conversa. O `channel` só
 * volta a decidir quando a conversa não tem instância — e aí ele é a única
 * pista que há.
 */

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  capacidadesDe,
  type CanalAberto,
  type ConversaDoCanal,
  type Destinatario,
  type ProvedorTipo,
  type Rede,
} from "./tipos";

/**
 * As colunas de uma instância.
 *
 * `network` entra aqui na Fase 1, junto da migration que a cria. Até lá o
 * Zernio é compatível com qualquer rede (ver `redeDo`), porque não há onde
 * guardar a escolha — e selecionar coluna que não existe derruba a consulta
 * inteira, não só o campo.
 */
const COLUNAS =
  "id, name, instance_name, provider, company_id, unit_id, custom_host, " +
  "evogo_api_key, stevo_api_key, oficial_phone_number_id, oficial_access_token, " +
  "oficial_waba_id, network, zernio_account_id, webhook_base, " +
  "companies(evogo_host, stevo_host, zernio_api_key, zernio_base_url, zernio_webhook_secret, zernio_signature_secret)";

/** A rede que um provedor atende. */
function redeDo(provedor: string, canalDaConversa: string): Rede {
  switch (provedor) {
    case "instagram":
      return "instagram";
    case "messenger":
    case "facebook":
      return "messenger";
    case "evogo":
    case "stevo":
    case "oficial":
      return "whatsapp";
    /**
     * O Zernio atende WhatsApp **e** Instagram sob a mesma credencial, e é por
     * isso que a rede não pode sair do tipo do provedor.
     */
    case "zernio":
      return canalDaConversa === "instagram" ? "instagram" : "whatsapp";
    default:
      return "whatsapp";
  }
}

/**
 * A instância serve esta conversa?
 *
 * Guarda contra dado torto: conversa de WhatsApp apontando para instância de
 * Instagram existe (troca de canal, importação, instância apagada), e mandar
 * por ela seria falar Instagram com um telefone. Quando não serve, o motor cai
 * para a busca por unidade — que é a autorreparação que já existia.
 */
function serve(provedor: string, canalDaConversa: string, networkGravada?: string | null): boolean {
  if (networkGravada) {
    return networkGravada === redeEsperada(canalDaConversa);
  }
  return redeDo(provedor, canalDaConversa) === redeEsperada(canalDaConversa);
}

function redeEsperada(canalDaConversa: string): Rede {
  if (canalDaConversa === "instagram") return "instagram";
  if (canalDaConversa === "messenger" || canalDaConversa === "facebook") return "messenger";
  return "whatsapp";
}

/** Os provedores que podem atender a rede desta conversa, quando é preciso adivinhar. */
function candidatosPara(canalDaConversa: string): string[] {
  switch (redeEsperada(canalDaConversa)) {
    case "instagram":
      return ["instagram", "zernio"];
    case "messenger":
      return ["messenger", "facebook"];
    default:
      return ["evogo", "oficial", "stevo", "zernio"];
  }
}

type InstanciaBruta = {
  id: string;
  name: string | null;
  instance_name: string | null;
  provider: string | null;
  network?: string | null;
  zernio_account_id?: string | null;
  webhook_base?: string | null;
  company_id: string | null;
  unit_id: string | null;
  custom_host: string | null;
  evogo_api_key: string | null;
  stevo_api_key: string | null;
  oficial_phone_number_id: string | null;
  oficial_access_token: string | null;
  oficial_waba_id: string | null;
  companies?: {
    evogo_host?: string | null;
    stevo_host?: string | null;
    zernio_api_key?: string | null;
    zernio_base_url?: string | null;
    zernio_webhook_secret?: string | null;
    zernio_signature_secret?: string | null;
  } | null;
};

function montar(bruta: InstanciaBruta, canalDaConversa: string): CanalAberto {
  const provedor = (bruta.provider || "evogo") as ProvedorTipo;
  const empresa = Array.isArray(bruta.companies) ? bruta.companies[0] : bruta.companies;

  // O host da instância vence o global da empresa: é para isso que ele existe.
  const hostGlobal = provedor === "stevo" ? empresa?.stevo_host : empresa?.evogo_host;
  const redeFinal = (bruta.network as Rede) || redeDo(provedor, canalDaConversa);

  return {
    id: bruta.id,
    provedor,
    rede: redeFinal,
    nome: bruta.name,
    companyId: bruta.company_id,
    unitId: bruta.unit_id,
    host: bruta.custom_host || hostGlobal || null,
    token: provedor === "stevo" ? bruta.stevo_api_key : bruta.evogo_api_key,
    instanceName: bruta.instance_name,
    contaId: bruta.oficial_phone_number_id,
    contaToken: bruta.oficial_access_token,
    contaPaiId: bruta.oficial_waba_id,
    zernioAccountId: bruta.zernio_account_id || null,
    zernioApiKey: empresa?.zernio_api_key || null,
    zernioBaseUrl: bruta.webhook_base || empresa?.zernio_base_url || "https://zernio.com/api",
    zernioWebhookSecret: empresa?.zernio_webhook_secret || null,
    capacidades: capacidadesDe(provedor),
  };
}

/**
 * Abre o canal de uma conversa.
 *
 * Três degraus, e o primeiro é o que importa:
 *
 * 1. a instância gravada na conversa, se ela serve a rede da conversa;
 * 2. qualquer instância que sirva, na mesma unidade;
 * 3. qualquer instância que sirva, na mesma empresa.
 *
 * Achando nos degraus 2 ou 3, a conversa é reparada — era o que os dois
 * caminhos já faziam, cada um por sua conta.
 */
export async function abrirCanal(conv: ConversaDoCanal): Promise<CanalAberto> {
  const candidatos = candidatosPara(conv.channel);
  let bruta: InstanciaBruta | null = null;

  // 1. A instância da conversa manda — quando serve.
  if (conv.whatsapp_instance_id) {
    const { data } = await supabaseAdmin
      .from("whatsapp_instances")
      .select(COLUNAS)
      .eq("id", conv.whatsapp_instance_id)
      .maybeSingle();

    const achada = data as InstanciaBruta | null;
    if (achada && serve(achada.provider || "evogo", conv.channel, achada.network)) {
      bruta = achada;
    }
  }

  // 2. Na unidade.
  if (!bruta && conv.unit_id) {
    const { data } = await supabaseAdmin
      .from("whatsapp_instances")
      .select(COLUNAS)
      .eq("unit_id", conv.unit_id)
      .in("provider", candidatos)
      .order("created_at");

    const lista = (data || []) as InstanciaBruta[];
    bruta = lista.find((inst) => serve(inst.provider || "evogo", conv.channel, inst.network)) || null;
  }

  // 3. Na empresa. A unidade da conversa é o caminho para achá-la.
  if (!bruta && conv.unit_id) {
    const { data: unidade } = await supabaseAdmin
      .from("units")
      .select("company_id")
      .eq("id", conv.unit_id)
      .maybeSingle();

    if (unidade?.company_id) {
      const { data } = await supabaseAdmin
        .from("whatsapp_instances")
        .select(COLUNAS)
        .eq("company_id", unidade.company_id)
        .in("provider", candidatos)
        .order("created_at");

      const lista = (data || []) as InstanciaBruta[];
      bruta = lista.find((inst) => serve(inst.provider || "evogo", conv.channel, inst.network)) || null;
    }
  }

  if (!bruta) {
    throw new Error(
      `Nenhum canal configurado para esta conversa (rede ${redeEsperada(conv.channel)}). ` +
        "Cadastre uma conexão em Configurações.",
    );
  }

  // A autorreparação: a conversa passa a apontar para o canal que a atende.
  if (bruta.id !== conv.whatsapp_instance_id) {
    const { error } = await supabaseAdmin
      .from("conversations")
      .update({ whatsapp_instance_id: bruta.id })
      .eq("id", conv.id);
    // Não engolir: foi assim que uma coluna inexistente ficou escondida por uma
    // tarde. A mensagem ainda sai — o reparo é que não pegou.
    if (error) {
      console.error("[canais] Falha ao reparar whatsapp_instance_id da conversa:", error);
    }
  }

  return montar(bruta, conv.channel);
}

/**
 * A quem a mensagem vai.
 *
 * A regra unifica as duas que existiam. A do envio de gente prevalece, com a
 * razão que já estava escrita lá: **no WhatsApp o identificador prioritário é
 * o telefone real**, porque o LID nem sempre é endereçável. O outro caminho
 * preferia o `remote_id`, que num contato com LID é justamente o menos
 * confiável dos dois.
 */
export function destinatarioDe(
  canal: CanalAberto,
  conv: { remote_id?: string | null },
  contato: { phone?: string | null; whatsapp_lid?: string | null; instagram_id?: string | null; messenger_id?: string | null } | null | undefined,
): Destinatario {
  if (canal.rede === "instagram") {
    const id = conv.remote_id || contato?.instagram_id || contato?.whatsapp_lid || contato?.phone || "";
    if (!id) {
      throw new Error("O contato não tem o identificador do Instagram (IGSID).");
    }
    return {
      identificador: id,
      origem: conv.remote_id ? "remote_id" : (contato?.instagram_id ? "instagram_id" : "lid"),
    };
  }

  if (canal.rede === "messenger") {
    const id = conv.remote_id || contato?.messenger_id || contato?.whatsapp_lid || contato?.phone || "";
    if (!id) {
      throw new Error("O contato não tem o identificador da Página (PSID).");
    }
    return {
      identificador: id,
      origem: conv.remote_id ? "remote_id" : (contato?.messenger_id ? "messenger_id" : "lid"),
    };
  }

  const telefone = contato?.phone || conv.remote_id || contato?.whatsapp_lid || "";
  if (!telefone) {
    throw new Error("O contato não tem telefone nem identificador remoto.");
  }
  return { identificador: telefone, origem: contato?.phone ? "telefone" : "remote_id" };
}

export type { CanalAberto, ConversaDoCanal, Destinatario } from "./tipos";
