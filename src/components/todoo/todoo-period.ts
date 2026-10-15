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

/** Limites do dia atual e dias que faltam no mês (contando hoje), para o Meu Dia. */
export function todooDayBounds() {
  const today = todayInSaoPaulo();
  const { dayStart, monthStart } = todooPeriodStarts();
  const dayEnd = new Date(new Date(dayStart).getTime() + 24 * 60 * 60 * 1000).toISOString();
  const [y, m, d] = today.split("-").map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();
  return { dayStart, dayEnd, monthStart, daysLeftInMonth: daysInMonth - d + 1 };
}

export type TodooRangeKey = "month" | "last_month" | "all";

/** Intervalo [from, to) em ISO para os filtros de período da Gincana e dos Indicadores. */
export function todooRange(key: TodooRangeKey): { from: string | null; to: string | null } {
  if (key === "all") return { from: null, to: null };
  const [y, m] = currentTodooMonth().split("-").map(Number);
  const monthStart = (year: number, month: number) =>
    new Date(`${year}-${String(month).padStart(2, "0")}-01T00:00:00${TZ_OFFSET}`).toISOString();
  const thisMonth = monthStart(y, m);
  if (key === "month") return { from: thisMonth, to: null };
  return { from: monthStart(m === 1 ? y - 1 : y, m === 1 ? 12 : m - 1), to: thisMonth };
}

/** Telefone para exibição: (27) 99648-6850. */
export function formatTodooPhone(phone: string | null | undefined): string {
  if (!phone) return "";
  const d = phone.replace(/\D/g, "").replace(/^55(?=\d{10,11}$)/, "");
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return phone;
}
