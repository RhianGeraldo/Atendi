// Datas das metas do Todoo no horário de Brasília (sem horário de verão desde 2019).
const TZ_OFFSET = "-03:00";

function todayInSaoPaulo(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/** Mês atual no formato 'YYYY-MM' (chave de todoo_goals.month_year). */
export function currentTodooMonth(): string {
  return todayInSaoPaulo().slice(0, 7);
}

/** Início do dia e do mês atuais, em ISO, para filtrar created_at. */
export function todooPeriodStarts() {
  const today = todayInSaoPaulo();
  return {
    dayStart: new Date(`${today}T00:00:00${TZ_OFFSET}`).toISOString(),
    monthStart: new Date(`${today.slice(0, 7)}-01T00:00:00${TZ_OFFSET}`).toISOString(),
  };
}
