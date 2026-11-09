/**
 * Fila assíncrona serializada por chat (inspirada na arquitetura do Chatwoot).
 *
 * Garante que mensagens do MESMO cliente/chat sejam sempre processadas em
 * ordem estrita (FIFO), uma após a outra, eliminando 100% de condições de corrida
 * (ex: eco de celular físico competindo com mensagem de cliente, ou rajada de
 * mensagens do cliente chegando em paralelo).
 *
 * Mensagens de clientes DIFERENTES continuam rodando em paralelo sem nenhuma espera.
 */

interface QueueItem<T> {
  task: () => Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: any) => void;
  timeoutMs: number;
}

class KeyedAsyncQueue {
  private queues = new Map<string, Array<QueueItem<any>>>();
  private running = new Set<string>();

  // IDs externos atualmente em processamento (in-flight)
  private inFlightExternalIds = new Set<string>();

  // IDs externos já processados com sucesso (TTL: 5 minutos)
  // Dropa retries de webhook idênticos instantaneamente (0ms)
  private completedExternalIds = new Map<string, number>();
  private readonly DEDUP_TTL_MS = 5 * 60 * 1000;

  constructor() {
    // Limpeza periódica do cache de deduplicação
    setInterval(() => {
      const now = Date.now();
      for (const [id, timestamp] of this.completedExternalIds.entries()) {
        if (now - timestamp > this.DEDUP_TTL_MS) {
          this.completedExternalIds.delete(id);
        }
      }
    }, 60 * 1000).unref?.();
  }

  /**
   * Verifica se o externalId já foi processado ou está em processamento agora.
   * Se já estiver em andamento ou já completou, retorna true (duplicata).
   * Se for novo, registra como in-flight e retorna false.
   */
  public checkAndStart(externalId: string | null | undefined): boolean {
    if (!externalId) return false;

    // Se já está rodando neste instante ou completou recentemente: é duplicata
    if (this.inFlightExternalIds.has(externalId)) return true;

    const completedAt = this.completedExternalIds.get(externalId);
    if (completedAt && Date.now() - completedAt < this.DEDUP_TTL_MS) {
      return true;
    }

    this.inFlightExternalIds.add(externalId);
    return false;
  }

  /**
   * Marca o externalId como concluído com sucesso (mantém no cache de deduplicação).
   */
  public markSuccess(externalId: string | null | undefined): void {
    if (!externalId) return;
    this.inFlightExternalIds.delete(externalId);
    this.completedExternalIds.set(externalId, Date.now());
  }

  /**
   * Libera o externalId se o processamento falhou, permitindo que retries futuros
   * tentem novamente sem serem bloqueados falsamente por deduplicação.
   */
  public markFailed(externalId: string | null | undefined): void {
    if (!externalId) return;
    this.inFlightExternalIds.delete(externalId);
  }

  /**
   * Enfileira uma tarefa associada a uma chave específica (ex: instance:phone).
   * A tarefa só inicia após todas as tarefas anteriores da MESMA chave terminarem.
   */
  public enqueue<T>(key: string, task: () => Promise<T>, timeoutMs = 25000): Promise<T> {
    if (!key || key === "global") {
      // Se não há chave específica de chat, executa diretamente
      return task();
    }

    return new Promise<T>((resolve, reject) => {
      const queue = this.queues.get(key) || [];
      queue.push({ task, resolve, reject, timeoutMs });
      this.queues.set(key, queue);

      if (!this.running.has(key)) {
        this.processNext(key);
      }
    });
  }

  private async processNext(key: string): Promise<void> {
    const queue = this.queues.get(key);
    if (!queue || queue.length === 0) {
      this.queues.delete(key);
      this.running.delete(key);
      return;
    }

    this.running.add(key);
    const item = queue.shift()!;

    let timer: NodeJS.Timeout | null = null;
    let finished = false;

    try {
      const taskPromise = item.task();
      // Previne unhandled rejection se a tarefa falhar após timeout
      taskPromise.catch((e) => {
        if (finished) {
          console.warn(`[chat-queue] Tarefa para ${key} encerrou com erro após timeout:`, e?.message || e);
        }
      });

      const timeoutPromise = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          if (!finished) {
            reject(new Error(`[chat-queue] Timeout de ${item.timeoutMs}ms excedido para a chave ${key}`));
          }
        }, item.timeoutMs);
      });

      const result = await Promise.race([taskPromise, timeoutPromise]);
      finished = true;
      if (timer) clearTimeout(timer);
      item.resolve(result);
    } catch (err) {
      finished = true;
      if (timer) clearTimeout(timer);
      item.reject(err);
    } finally {
      // Processa o próximo item desta mesma chave em sequência
      this.processNext(key);
    }
  }

  /** Retorna métricas de saúde da fila */
  public getStats() {
    return {
      activeQueues: this.queues.size,
      runningChats: this.running.size,
      inFlightExternalIds: this.inFlightExternalIds.size,
      cachedDedupIds: this.completedExternalIds.size,
    };
  }
}

// Instância global única compartilhada no processo backend
export const chatQueue = new KeyedAsyncQueue();
