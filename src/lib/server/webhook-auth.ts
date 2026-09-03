/**
 * As trancas da porta por onde os provedores nos chamam.
 *
 * Hoje `/api/webhooks/*` aceita qualquer POST: não há apikey, não há HMAC, não
 * há allowlist. O corpo é confiado, e o que ele diz vira escrita com o service
 * role — que ignora RLS por definição. Este arquivo é o que falta para fechar
 * isso, e nasce compartilhado porque as regras são as mesmas para todos:
 *
 *  - **comparar em tempo constante**, sempre;
 *  - **ler os bytes crus antes de qualquer parse** — assinatura é sobre bytes, e
 *    `JSON.parse` seguido de `stringify` já não reproduz o que foi assinado;
 *  - **quando vem assinatura, ela tem de bater; quando não vem, vale o segredo
 *    da URL.** Provedor que aceita o segredo no cadastro e mesmo assim entrega
 *    sem cabeçalho existe — exigir a assinatura sempre devolve 403 em toda
 *    entrega, com o cadastro inteiro correto.
 */

import crypto from "crypto";

/** Comparação que não vaza o tamanho do prefixo igual. */
export function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

/** Segredo nosso, para escrever no cadastro do provedor. */
export function novoSegredo(bytes = 32): string {
  return crypto.randomBytes(bytes).toString("hex");
}

/**
 * O cabeçalho que carrega a assinatura, procurado por forma e não por nome.
 *
 * Cada provedor batiza o seu: `x-hub-signature-256` na Meta, `x-zernio-signature`
 * no Zernio, `x-signature` em quem não pensou muito. Varrer por forma é o que
 * permite dizer **"não veio assinatura nenhuma"** com alguma confiança — e é
 * essa ausência que decide se a entrega passa pelo segredo da URL.
 */
const FORMA_DE_ASSINATURA = /signature|signed|hmac|hub\.|digest/i;

export function acharAssinatura(headers: Headers): { nome: string; valor: string } | null {
  for (const [nome, valor] of headers.entries()) {
    if (FORMA_DE_ASSINATURA.test(nome) && valor.trim()) {
      return { nome, valor: valor.trim() };
    }
  }
  return null;
}

/**
 * A assinatura confere?
 *
 * A especificação de quase todo provedor diz o algoritmo e o cabeçalho, e **não
 * diz a codificação**. Adivinhar uma só e errar dá 403 em todo evento, com o
 * segredo certo cadastrado — então aceitam-se as três formas em uso: prefixo
 * `sha256=`, hexadecimal puro e base64.
 */
export function assinaturaConfere(corpoBruto: string, recebida: string, segredo: string): boolean {
  const limpa = recebida.replace(/^sha256=/i, "").trim();
  if (!limpa) return false;

  const esperado = crypto.createHmac("sha256", segredo).update(corpoBruto, "utf8").digest();

  for (const forma of [esperado.toString("hex"), esperado.toString("base64")]) {
    if (safeEqual(limpa, forma)) return true;
  }
  return false;
}

/** O aviso de porta aberta é uma vez por processo, não uma por entrega. */
const jaAvisado = new Set<string>();

export type ResultadoDaPorta =
  | { ok: true; corpoBruto: string; assinado: boolean }
  | { ok: false; resposta: Response };

/**
 * A porta: lê o corpo cru e confere as duas trancas.
 *
 * `segredoDaUrl` é o `?k=` que nós geramos e escrevemos no cadastro do provedor.
 * `segredoDaAssinatura` é aquele com que **ele** assina o corpo.
 *
 * Quando nenhum dos dois está configurado, a porta **avisa e deixa passar**. É
 * deliberado e temporário: a base tem webhooks em produção cadastrados sem
 * segredo nenhum, e fechar a porta antes de trocar as URLs no painel de cada
 * provedor derrubaria o atendimento de todos os clientes de uma vez. O aviso é
 * o que torna a dívida visível — e some sozinho quando o segredo é preenchido.
 */
export async function conferirPorta(
  request: Request,
  opcoes: {
    /** Nome do provedor, para o log. */
    provedor: string;
    segredoDaUrl?: string | null;
    segredoDaAssinatura?: string | null;
    /**
     * A assinatura é obrigatória quando o segredo existe.
     *
     * Verdadeiro na Meta, que assina **toda** entrega: ali a ausência do
     * cabeçalho não é um provedor que ainda não assina, é alguém que o omitiu.
     * Falso no Zernio, que aceita o segredo no cadastro e mesmo assim entrega
     * sem cabeçalho — exigir lá devolveria 403 em toda entrega legítima.
     */
    exigirAssinatura?: boolean;
    /** Corpo já lido, quando quem chama precisou lê-lo antes. */
    corpoBruto?: string;
  },
): Promise<ResultadoDaPorta> {
  const { provedor, segredoDaUrl, segredoDaAssinatura } = opcoes;
  const corpoBruto = opcoes.corpoBruto ?? (await request.text());

  const negar = (motivo: string): ResultadoDaPorta => {
    console.warn(`[webhook:${provedor}] Entrega recusada: ${motivo}`);
    return {
      ok: false,
      resposta: new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      }),
    };
  };

  // Tranca 1 — o segredo da URL, que é a que sempre está lá quando existe.
  if (segredoDaUrl) {
    const url = new URL(request.url);
    const recebido = url.searchParams.get("k") ?? "";
    if (!recebido || !safeEqual(recebido, segredoDaUrl)) {
      return negar("o segredo da URL não confere");
    }
  }

  // Tranca 2 — a assinatura do corpo, quando ela vem.
  const assinatura = acharAssinatura(request.headers);
  if (segredoDaAssinatura) {
    if (assinatura) {
      if (!assinaturaConfere(corpoBruto, assinatura.valor, segredoDaAssinatura)) {
        return negar(`a assinatura em ${assinatura.nome} não confere`);
      }
      return { ok: true, corpoBruto, assinado: true };
    }
    if (opcoes.exigirAssinatura) {
      return negar("a entrega veio sem assinatura, e este provedor sempre assina");
    }
  }

  if (!segredoDaUrl && !segredoDaAssinatura && !jaAvisado.has(provedor)) {
    jaAvisado.add(provedor);
    console.warn(
      `[webhook:${provedor}] SEM AUTENTICAÇÃO: nenhum segredo configurado. ` +
        "Qualquer POST nesta URL é aceito, e o corpo dele vira escrita no banco. " +
        "Configure o segredo do webhook para fechar a porta.",
    );
  }

  return { ok: true, corpoBruto, assinado: false };
}

/**
 * A verificação de assinatura da Meta, no formato dela.
 *
 * Separada porque o `GET` de verificação (`hub.challenge`) e o `POST` assinado
 * são duas coisas distintas, e hoje a base só faz a primeira: o `POST` que
 * carrega as mensagens entra sem conferência nenhuma.
 */
export function assinaturaMetaConfere(corpoBruto: string, headers: Headers, appSecret: string): boolean {
  const recebida = headers.get("x-hub-signature-256") || headers.get("x-hub-signature");
  if (!recebida) return false;
  return assinaturaConfere(corpoBruto, recebida, appSecret);
}
