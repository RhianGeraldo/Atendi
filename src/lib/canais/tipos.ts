/**
 * O contrato entre a plataforma e qualquer provedor de mensagem.
 *
 * A regra que sustenta o desenho: **a conversa carrega o canal, o canal carrega
 * o provedor.** Quem envia nunca escolhe por onde — pergunta ao motor, e o motor
 * resolve pela instância gravada na conversa.
 *
 * Antes disto o envio deduzia o provedor a partir do `channel` da conversa
 * (`if (conv.channel === 'instagram') provider = 'instagram'`), em dois arquivos.
 * A dedução funciona enquanto cada rede tem um provedor só; quebra no primeiro
 * provedor que atende duas redes — que é exatamente o caso do Zernio.
 */

/** A rede social do outro lado. É do canal, nunca do tipo do provedor. */
export type Rede = "whatsapp" | "instagram" | "messenger";

/** Quem sabe falar com o mundo lá fora. */
export type ProvedorTipo =
  | "evogo"
  | "stevo"
  | "oficial"
  | "instagram"
  | "messenger"
  | "facebook"
  | "zernio";

/**
 * O que um provedor sabe fazer. A interface pergunta antes de oferecer, em vez
 * de mostrar um botão de reação que não reage.
 */
export interface Capacidades {
  midia: boolean;
  audio: boolean;
  reacao: boolean;
  edicao: boolean;
  exclusao: boolean;
  citacao: boolean;
  /** Conecta por QR code lido no celular. Falso em provedor conectado por OAuth. */
  qr: boolean;
  /** Modelos aprovados pela Meta. */
  template: boolean;
  /** A janela de 24 h da Meta se aplica. */
  janela24h: boolean;
}

const NAO_OFICIAL: Capacidades = {
  midia: true,
  audio: true,
  reacao: true,
  edicao: true,
  exclusao: true,
  citacao: true,
  qr: true,
  template: false,
  janela24h: false,
};

const META_DIRETO: Capacidades = {
  midia: true,
  audio: true,
  reacao: false,
  edicao: false,
  exclusao: false,
  citacao: true,
  qr: false,
  template: false,
  janela24h: true,
};

export const CAPACIDADES: Record<ProvedorTipo, Capacidades> = {
  // Sessão de WhatsApp: edita, apaga, reage, e conecta por QR.
  evogo: NAO_OFICIAL,
  stevo: NAO_OFICIAL,

  // Cloud API: janela de 24 h e modelos; não edita nem apaga.
  oficial: {
    midia: true,
    audio: true,
    reacao: true,
    edicao: false,
    exclusao: false,
    citacao: true,
    qr: false,
    template: true,
    janela24h: true,
  },

  instagram: META_DIRETO,
  messenger: META_DIRETO,
  facebook: META_DIRETO,

  /**
   * Zernio — a interseção honesta das duas redes que ele atende.
   *
   * `edicao` e `exclusao` falsas porque ele só edita no Telegram e só apaga em
   * Telegram, X, Bluesky e Reddit; WhatsApp e Instagram respondem 400.
   * `citacao` verdadeira porque funciona no WhatsApp — no Instagram ele ignora
   * `replyTo` em silêncio, e perder a citação é melhor que recusar a mensagem.
   * `qr` falsa: quem conecta a conta é o painel dele, por OAuth.
   */
  zernio: {
    midia: true,
    audio: true,
    reacao: true,
    edicao: false,
    exclusao: false,
    citacao: true,
    qr: false,
    template: true,
    janela24h: true,
  },
};

export function capacidadesDe(provedor: string): Capacidades {
  return CAPACIDADES[provedor as ProvedorTipo] ?? NAO_OFICIAL;
}

/**
 * O canal aberto: a instância com as credenciais já resolvidas.
 *
 * Os campos de credencial são anuláveis porque cada provedor usa os seus — o
 * EvoGo vai de `host` + `token` + `instanceName`, a Meta de `contaId` +
 * `contaToken`. Quem valida é o transporte, que sabe do que precisa.
 */
export interface CanalAberto {
  /** `whatsapp_instances.id` */
  id: string;
  provedor: ProvedorTipo;
  rede: Rede;
  nome: string | null;
  companyId: string | null;
  unitId: string | null;

  /** EvoGo / Stevo. */
  host: string | null;
  token: string | null;
  instanceName: string | null;

  /** Meta e derivados: `phone_number_id`, id da conta do Instagram, id da Página. */
  contaId: string | null;
  contaToken: string | null;
  /** WABA na Cloud API; id da Página quando a rede é Instagram. */
  contaPaiId: string | null;

  /** Zernio específico */
  zernioAccountId?: string | null;
  zernioApiKey?: string | null;
  zernioBaseUrl?: string | null;
  zernioWebhookSecret?: string | null;

  capacidades: Capacidades;
}

/** O que o motor precisa da conversa para achar o canal. */
export interface ConversaDoCanal {
  id: string;
  channel: string;
  unit_id: string | null;
  whatsapp_instance_id: string | null;
  provider_thread_id?: string | null;
}

/** A quem a mensagem é endereçada, já no formato que o provedor espera. */
export interface Destinatario {
  /** Telefone só com dígitos no WhatsApp; IGSID no Instagram; PSID no Messenger. */
  identificador: string;
  /** De onde ele saiu — vai para o log quando o envio falha. */
  origem: "telefone" | "remote_id" | "lid" | "instagram_id" | "messenger_id";
}
