import type { ComponentProps } from "react";
import { toast } from "sonner";
import { MessageNotificationToast } from "@/components/common/message-notification-toast";

type ToastProps = ComponentProps<typeof MessageNotificationToast>;

interface StackEntry {
  items: { id: string; text: string }[];
  isMention: boolean;
  timer?: ReturnType<typeof setTimeout>;
}

// Pilha de mensagens por cliente (conversa) ou canal da equipe
const stacks = new Map<string, StackEntry>();

export interface StackedToastOptions
  extends Omit<ToastProps, "toastId" | "messages" | "onDismiss"> {
  /** Chave única: conversa do cliente ou canal da equipe */
  key: string;
  /** ID da mensagem (evita duplicar a mesma mensagem na pilha) */
  messageId: string;
}

/**
 * Exibe 1 único toast por cliente/canal. Novas mensagens do mesmo
 * remetente são empilhadas dentro do mesmo card (atualizando-o).
 */
export function showStackedMessageToast({ key, messageId, ...props }: StackedToastOptions) {
  const entry = stacks.get(key) ?? { items: [], isMention: false };
  if (entry.timer) clearTimeout(entry.timer);

  if (!entry.items.some((m) => m.id === messageId)) {
    entry.items = [...entry.items, { id: messageId, text: props.previewText }].slice(-20);
  }
  if (props.isMention) entry.isMention = true;

  const clear = () => {
    const current = stacks.get(key);
    if (current?.timer) clearTimeout(current.timer);
    stacks.delete(key);
  };

  // Salvaguarda: limpa a pilha após 9 segundos de inatividade
  entry.timer = setTimeout(clear, 9000);
  stacks.set(key, entry);

  const messages = entry.items.map((m) => m.text);

  toast.custom(
    (t) => (
      <MessageNotificationToast
        {...props}
        toastId={t}
        isMention={entry.isMention}
        messages={messages}
        onOpen={() => {
          clear();
          toast.dismiss(t);
          props.onOpen();
        }}
        onDismiss={() => {
          clear();
          toast.dismiss(t);
        }}
      />
    ),
    {
      id: `stacked-toast-${key}`,
      duration: 8000,
      unstyled: true,
      className:
        "sonner-custom-toast !bg-transparent !border-0 !p-0 !shadow-none !rounded-none overflow-visible",
      onDismiss: clear,
      onAutoClose: clear,
    }
  );
}
