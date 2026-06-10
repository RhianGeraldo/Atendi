import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function getPhoneVariants(phone: string): string[] {
  // Somente aplica para números brasileiros
  if (!phone.startsWith('55')) return [phone];
  
  // 55 + 2 dígitos DDD = 4 caracteres
  const without55 = phone.substring(2);
  
  if (without55.length === 11 && without55[2] === '9') {
    // Tem o 9. Exemplo: 55 44 9 91529987 -> without55: 44 9 91529987
    const variant = '55' + without55.substring(0, 2) + without55.substring(3);
    return [phone, variant];
  } else if (without55.length === 10) {
    // Sem o 9. Exemplo: 55 44 91529987 -> without55: 44 91529987
    const variant = '55' + without55.substring(0, 2) + '9' + without55.substring(2);
    return [phone, variant];
  }
  
  return [phone];
}
