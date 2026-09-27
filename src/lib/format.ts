import { formatDistanceToNow, format, isToday, isYesterday } from "date-fns";
import { ptBR } from "date-fns/locale";

export function formatRelative(date: string | Date | null | undefined): string {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  return formatDistanceToNow(d, { addSuffix: true, locale: ptBR });
}

export function formatMessageTime(date: string | Date | null | undefined): string {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  
  if (isToday(d)) {
    return format(d, "HH:mm");
  } else if (isYesterday(d)) {
    return `Ontem ${format(d, "HH:mm")}`;
  } else {
    return format(d, "dd/MM/yyyy HH:mm");
  }
}

/**
 * Formatação concisa de horário para itens de conversa (estilo WhatsApp: 14:35, Ontem, 24/09).
 */
export function formatConversationTime(date: string | Date | null | undefined): string {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  if (isNaN(d.getTime())) return "—";

  if (isToday(d)) {
    return format(d, "HH:mm");
  }
  if (isYesterday(d)) {
    return "Ontem";
  }
  const now = new Date();
  if (d.getFullYear() === now.getFullYear()) {
    return format(d, "dd/MM");
  }
  return format(d, "dd/MM/yy");
}

export function formatPhone(phone?: string | null): string {
  if (!phone) return "";
  const digits = phone.replace(/\D/g, "");
  // +55 11 98765 0001
  if (digits.length >= 12) {
    const ddi = digits.slice(0, 2);
    const ddd = digits.slice(2, 4);
    const part1 = digits.slice(4, 9);
    const part2 = digits.slice(9, 13);
    return `+${ddi} (${ddd}) ${part1}-${part2}`;
  }
  if (digits.length === 11) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  }
  return phone;
}

export function formatBRL(value: number | null | undefined): string {
  if (value == null) return "R$ 0,00";
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function initials(name?: string | null): string {
  if (!name) return "?";
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");
}

/**
 * Formats a date-only string (e.g. "YYYY-MM-DD" or ISO string) safely without timezone offset shifts.
 */
export function formatDateOnly(dateVal: string | Date | null | undefined, formatStr: string = "dd/MM/yyyy"): string {
  if (!dateVal) return "";
  try {
    if (typeof dateVal === "string") {
      const datePart = dateVal.split("T")[0];
      const parts = datePart.split("-");
      if (parts.length === 3) {
        const year = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10) - 1;
        const day = parseInt(parts[2], 10);
        return format(new Date(year, month, day, 12, 0, 0), formatStr, { locale: ptBR });
      }
    }
    const d = new Date(dateVal);
    if (isNaN(d.getTime())) return "";
    return format(d, formatStr, { locale: ptBR });
  } catch {
    return "";
  }
}
