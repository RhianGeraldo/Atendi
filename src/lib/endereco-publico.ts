/**
 * Endereço do Atendi que os provedores (EvoGo, Stevo, Meta, Zernio) usam para
 * mandar os webhooks.
 *
 * O padrão é o domínio aberto no navegador, mas aberto no localhost ou num
 * preview da Vercel ele não serve: o provedor não alcança o localhost, e o
 * preview some no próximo deploy. Nesses casos usa o endereço de produção.
 */

const ENDERECO_DE_PRODUCAO = "https://atendiai.vercel.app";

/** localhost, 127.x, rede privada ou .local: endereço que um servidor externo não alcança. */
export function enderecoLocal(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return (
      host === "localhost" ||
      host.endsWith(".local") ||
      /^127\./.test(host) ||
      /^10\./.test(host) ||
      /^192\.168\./.test(host) ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(host)
    );
  } catch {
    return false;
  }
}

function previewDaVercel(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return host.endsWith(".vercel.app") && host !== new URL(ENDERECO_DE_PRODUCAO).hostname;
  } catch {
    return false;
  }
}

export function origemPublica(): string {
  const origem = typeof window !== "undefined" ? window.location.origin : "";
  if (!origem || enderecoLocal(origem) || previewDaVercel(origem)) return ENDERECO_DE_PRODUCAO;
  return origem;
}
