import {
  ShoppingBag,
  Plane,
  Smartphone,
  Heart,
  Sparkles,
  GraduationCap,
  Home,
  Gift,
  type LucideIcon,
} from "lucide-react";
import confetti from "canvas-confetti";
import type { TodooDreamCategory } from "@/types/todoo";

export interface DreamCategoryMeta {
  label: string;
  icon: LucideIcon;
  color: string;
  bgLight: string;
}

export const DREAM_CATEGORIES: Record<TodooDreamCategory, DreamCategoryMeta> = {
  acessorio: {
    label: "Moda & Acessórios",
    icon: ShoppingBag,
    color: "text-pink-600 dark:text-pink-400",
    bgLight: "bg-pink-500/10 border-pink-500/20 text-pink-600 dark:text-pink-300",
  },
  viagem: {
    label: "Viagem & Férias",
    icon: Plane,
    color: "text-sky-600 dark:text-sky-400",
    bgLight: "bg-sky-500/10 border-sky-500/20 text-sky-600 dark:text-sky-300",
  },
  eletronico: {
    label: "Tecnologia & Gadgets",
    icon: Smartphone,
    color: "text-blue-600 dark:text-blue-400",
    bgLight: "bg-blue-500/10 border-blue-500/20 text-blue-600 dark:text-blue-300",
  },
  familia: {
    label: "Família & Filhos",
    icon: Heart,
    color: "text-rose-600 dark:text-rose-400",
    bgLight: "bg-rose-500/10 border-rose-500/20 text-rose-600 dark:text-rose-300",
  },
  experiencia: {
    label: "Beleza & Bem-Estar",
    icon: Sparkles,
    color: "text-purple-600 dark:text-purple-400",
    bgLight: "bg-purple-500/10 border-purple-500/20 text-purple-600 dark:text-purple-300",
  },
  curso: {
    label: "Curso & Estudos",
    icon: GraduationCap,
    color: "text-amber-600 dark:text-amber-400",
    bgLight: "bg-amber-500/10 border-amber-500/20 text-amber-600 dark:text-amber-300",
  },
  casa: {
    label: "Casa & Conforto",
    icon: Home,
    color: "text-emerald-600 dark:text-emerald-400",
    bgLight: "bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-300",
  },
  outro: {
    label: "Outro Desejo Especial",
    icon: Gift,
    color: "text-violet-600 dark:text-violet-400",
    bgLight: "bg-violet-500/10 border-violet-500/20 text-violet-600 dark:text-violet-300",
  },
};

export interface DreamPreset {
  title: string;
  value: number;
  category: TodooDreamCategory;
  defaultCommission: number;
  imageUrl?: string;
}

export const DREAM_PRESETS: DreamPreset[] = [
  {
    title: "Bolsa Desejada",
    value: 300,
    category: "acessorio",
    defaultCommission: 5,
    imageUrl: "https://images.unsplash.com/photo-1584917865442-de89df76afd3?auto=format&fit=crop&w=600&q=80",
  },
  {
    title: "Jantar Especial a Dois",
    value: 250,
    category: "experiencia",
    defaultCommission: 5,
    imageUrl: "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=600&q=80",
  },
  {
    title: "Perfume Importado",
    value: 450,
    category: "experiencia",
    defaultCommission: 5,
    imageUrl: "https://images.unsplash.com/photo-1541643600914-78b084683601?auto=format&fit=crop&w=600&q=80",
  },
  {
    title: "Tênis Novo",
    value: 500,
    category: "acessorio",
    defaultCommission: 5,
    imageUrl: "https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=600&q=80",
  },
  {
    title: "Fim de Semana na Praia",
    value: 1200,
    category: "viagem",
    defaultCommission: 5,
    imageUrl: "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=600&q=80",
  },
  {
    title: "Celular dos Sonhos",
    value: 3500,
    category: "eletronico",
    defaultCommission: 5,
    imageUrl: "https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?auto=format&fit=crop&w=600&q=80",
  },
];

export function formatCurrency(val: number | string | null | undefined): string {
  const num = Number(val) || 0;
  return num.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

export function calculateDreamProgress(
  dream: { target_value: number; commission_rate: number },
  totalWonRevenue: number
) {
  const targetValue = Math.max(1, Number(dream.target_value) || 1);
  const commissionRate = Math.max(0.1, Number(dream.commission_rate) || 5);
  const targetRevenueNeeded = targetValue / (commissionRate / 100);
  const accumulatedCommission = totalWonRevenue * (commissionRate / 100);
  const progressPct = Math.min(100, Math.max(0, (accumulatedCommission / targetValue) * 100));
  const remainingRevenue = Math.max(0, targetRevenueNeeded - totalWonRevenue);
  const remainingCommission = Math.max(0, targetValue - accumulatedCommission);
  const isCompleted = accumulatedCommission >= targetValue;

  return {
    targetRevenueNeeded,
    accumulatedCommission,
    progressPct: Math.round(progressPct * 10) / 10,
    remainingRevenue,
    remainingCommission,
    isCompleted,
  };
}

export function getMotivationalMessage(pct: number, dreamTitle: string): string {
  if (pct >= 100) {
    return `🎉 SONHO CONQUISTADO! Você bateu sua meta e conquistou "${dreamTitle}"!`;
  }
  if (pct >= 85) {
    return `🔥 Reta finalíssima! Falta apenas um último empurrãozinho para garantir "${dreamTitle}"!`;
  }
  if (pct >= 60) {
    return `🚀 Você já passou da metade! "${dreamTitle}" está quase saindo da vitrine para as suas mãos!`;
  }
  if (pct >= 35) {
    return `💪 Excelente ritmo! Continue atendendo seus contatos e veja o progresso crescer!`;
  }
  if (pct > 0) {
    return `✨ Primeiros passos dados! Cada atendimento e fechamento te deixa mais perto!`;
  }
  return `🎯 Cadastrado! Feche vendas no CRM para ver este sonho se tornar realidade!`;
}

export function triggerConfetti() {
  const count = 200;
  const defaults = {
    origin: { y: 0.7 },
    zIndex: 9999,
  };

  function fire(particleRatio: number, opts: confetti.Options) {
    confetti({
      ...defaults,
      ...opts,
      particleCount: Math.floor(count * particleRatio),
    });
  }

  fire(0.25, {
    spread: 26,
    startVelocity: 55,
  });
  fire(0.2, {
    spread: 60,
  });
  fire(0.35, {
    spread: 100,
    decay: 0.91,
    scalar: 0.8,
  });
  fire(0.1, {
    spread: 120,
    startVelocity: 25,
    decay: 0.92,
    scalar: 1.2,
  });
  fire(0.1, {
    spread: 120,
    startVelocity: 45,
  });
}
