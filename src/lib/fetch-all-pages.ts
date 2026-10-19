// O PostgREST devolve no máximo 1.000 linhas por consulta: busca em páginas até acabar.
// A consulta precisa de uma ordem estável (created_at/occurred_at + id).
const PAGE_SIZE = 1000;
const MAX_PAGES = 50;

export async function fetchAllPages(build: () => any): Promise<{ data: any[]; error: any }> {
  const rows: any[] = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const { data, error } = await build().range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
    if (error) return { data: rows, error };
    rows.push(...(data || []));
    if (!data || data.length < PAGE_SIZE) break;
  }
  return { data: rows, error: null };
}
