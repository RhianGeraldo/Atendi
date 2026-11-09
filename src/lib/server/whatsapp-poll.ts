import crypto from "crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export interface DecryptPollVoteParams {
  origMsgId: string;
  messageSecretBase64: string;
  encIvBase64: string;
  encPayloadBase64: string;
  origSenderCandidates: string[];
  voterCandidates: string[];
  options: string[];
}

/**
 * Decifra o voto de uma enquete do WhatsApp (pollUpdateMessage).
 *
 * Utiliza derivação HKDF com a chave de segredo original (messageSecret)
 * e o AES-256-GCM com AAD vinculando a mensagem original ao votante.
 * Em seguida, compara os hashes SHA-256 do payload decifrado com os nomes das opções da enquete.
 */
export function decryptWhatsAppPollVote({
  origMsgId,
  messageSecretBase64,
  encIvBase64,
  encPayloadBase64,
  origSenderCandidates,
  voterCandidates,
  options,
}: DecryptPollVoteParams): string[] {
  if (!messageSecretBase64 || !encIvBase64 || !encPayloadBase64) return [];

  const messageSecret = Buffer.from(messageSecretBase64, "base64");
  const encIv = Buffer.from(encIvBase64, "base64");
  const encPayload = Buffer.from(encPayloadBase64, "base64");

  if (encPayload.length <= 16) return [];

  const tagLength = 16;
  const ciphertext = encPayload.subarray(0, encPayload.length - tagLength);
  const tag = encPayload.subarray(encPayload.length - tagLength);
  const modificationType = "Poll Vote";

  const optionHashes = options.map((opt) => ({
    name: opt,
    hash: crypto.createHash("sha256").update(opt).digest(),
  }));

  const salts = [Buffer.alloc(32), Buffer.alloc(0)];

  // Limpa e normaliza a lista de candidatos (com/sem sufixo de dispositivo e com/sem domínio)
  const cleanList = (list: (string | null | undefined)[]) => {
    const set = new Set<string>();
    for (const item of list) {
      if (!item) continue;
      const str = String(item).trim();
      set.add(str);
      if (str.includes(":")) {
        set.add(str.replace(/:\d+@/, "@"));
      }
      if (str.includes("@")) {
        set.add(str.split("@")[0].split(":")[0]);
      }
    }
    return Array.from(set);
  };

  const cleanOrigSenders = cleanList(origSenderCandidates);
  const cleanVoters = cleanList(voterCandidates);

  for (const origSender of cleanOrigSenders) {
    for (const voter of cleanVoters) {
      const useCaseSecret = Buffer.concat([
        Buffer.from(origMsgId),
        Buffer.from(origSender),
        Buffer.from(voter),
        Buffer.from(modificationType),
      ]);

      for (const salt of salts) {
        try {
          const secretKey = crypto.hkdfSync("sha256", messageSecret, salt, useCaseSecret, 32);
          const aad = Buffer.concat([
            Buffer.from(origMsgId),
            Buffer.from("\x00"),
            Buffer.from(voter),
          ]);

          const decipher = crypto.createDecipheriv("aes-256-gcm", secretKey, encIv);
          decipher.setAAD(aad);
          decipher.setAuthTag(tag);
          const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);

          const matched: string[] = [];
          for (const item of optionHashes) {
            if (decrypted.includes(item.hash)) {
              matched.push(item.name);
            }
          }
          return matched;
        } catch {
          // Continua tentando combinações de JID/LID/salt
        }
      }
    }
  }

  return [];
}

/**
 * Processa a atualização de voto de uma enquete recebida via webhook (EvoGo ou Stevo).
 * Atualiza a coluna metadata.poll.votes da mensagem original e notifica via realtime.
 */
export async function handlePollUpdate(
  pollUpdate: any,
  info: any,
  data: any,
  providerLabel: string = "webhook",
): Promise<void> {
  const origPollId =
    pollUpdate?.pollCreationMessageKey?.ID ||
    pollUpdate?.pollCreationMessageKey?.id;

  if (!origPollId) {
    console.log(`[${providerLabel}] pollUpdateMessage ignorado: sem ID da enquete original.`);
    return;
  }

  // 1. Busca as mensagens da enquete original no banco (suporta múltiplas instâncias no mesmo grupo)
  const { data: origMsgs, error: fetchErr } = await supabaseAdmin
    .from("messages")
    .select("id, conversation_id, participant_jid, metadata")
    .or(`remote_msg_id.eq.${origPollId},remote_msg_id.like.${origPollId}_%`);

  if (fetchErr || !origMsgs || origMsgs.length === 0) {
    console.log(
      `[${providerLabel}] Enquete original não encontrada no banco (remote_msg_id=${origPollId}).`,
    );
    return;
  }

  // Usa a primeira mensagem que tiver opções configuradas
  const origMsg = origMsgs.find((m) => m.metadata?.poll?.options?.length > 0) || origMsgs[0];
  const currentMetadata = origMsg.metadata || {};
  const currentPoll = currentMetadata.poll || {};
  const options: string[] = currentPoll.options || [];

  if (options.length === 0) {
    console.log(`[${providerLabel}] Enquete ${origPollId} sem opções salvas.`);
    return;
  }

  // 2. Coleta candidatos a JID para origSender e voter
  const origSenderCandidates = [
    pollUpdate?.pollCreationMessageKey?.participant,
    pollUpdate?.pollCreationMessageKey?.Participant,
    pollUpdate?.pollCreationMessageKey?.remoteJID,
    pollUpdate?.pollCreationMessageKey?.remoteJid,
    pollUpdate?.pollCreationMessageKey?.RemoteJID,
    origMsg.participant_jid,
    data?.groupData?.OwnerJID,
    data?.groupData?.OwnerPN,
  ];

  const voterCandidates = [
    info?.SenderAlt,
    data?.RawSenderAlt,
    info?.RawSenderAlt,
    info?.Sender,
    info?.RawSender,
    data?.RawSender,
  ];

  // Adiciona participantes do groupData se disponíveis
  if (Array.isArray(data?.groupData?.Participants)) {
    for (const p of data.groupData.Participants) {
      if (
        (info?.Sender && p.PhoneNumber === info.Sender) ||
        (info?.SenderAlt && p.LID === info.SenderAlt)
      ) {
        if (p.LID) voterCandidates.push(p.LID);
        if (p.PhoneNumber) voterCandidates.push(p.PhoneNumber);
      }
    }
  }

  const selectedOptions = decryptWhatsAppPollVote({
    origMsgId: origPollId,
    messageSecretBase64: currentPoll.messageSecret,
    encIvBase64:
      pollUpdate?.vote?.encIV ||
      pollUpdate?.vote?.encIv ||
      pollUpdate?.vote?.EncIV ||
      pollUpdate?.vote?.EncIv,
    encPayloadBase64:
      pollUpdate?.vote?.encPayload ||
      pollUpdate?.vote?.EncPayload,
    origSenderCandidates,
    voterCandidates,
    options,
  });

  console.log(
    `[${providerLabel}] Voto decifrado para enquete ${origPollId}:`,
    selectedOptions.length > 0 ? selectedOptions : "(nenhuma opção selecionada / voto removido)",
  );

  // 3. Monta identificação do votante
  const voterPhone = (info?.Sender || data?.RawSender || "")
    .replace(/@.*$/, "")
    .replace(/:\d+$/, "");
  const voterLid = (info?.SenderAlt || data?.RawSenderAlt || "").replace(/@.*$/, "");
  const rawVoterName = info?.PushName || info?.VerifiedName || voterPhone || "Participante";
  const timestamp = pollUpdate?.senderTimestampMS || Date.now();

  const currentVotes = { ...(currentPoll.votes || {}) };

  // Verifica se já existe um voto deste participante para evitar duplicidades por Phone vs LID
  const existingKey = Object.keys(currentVotes).find((k) => {
    const v = currentVotes[k];
    if (voterPhone && (v.voterPhone === voterPhone || k === voterPhone)) return true;
    if (voterLid && (v.voterLid === voterLid || k === voterLid)) return true;
    return false;
  });

  const voterKey = existingKey || voterPhone || voterLid || `voter_${Date.now()}`;
  const prevVote = currentVotes[voterKey] || {};

  // Preserva o nome humanizado existente se o evento atual só trouxer o número bruto
  const voterName =
    rawVoterName && rawVoterName !== voterPhone
      ? rawVoterName
      : prevVote.voterName || rawVoterName;

  currentVotes[voterKey] = {
    voterKey,
    voterJid: info?.Sender || data?.RawSender || prevVote.voterJid || null,
    voterLid: info?.SenderAlt || data?.RawSenderAlt || prevVote.voterLid || null,
    voterPhone: voterPhone || prevVote.voterPhone || null,
    voterName,
    selectedOptions,
    timestamp,
  };

  const updatedPoll = {
    ...currentPoll,
    votes: currentVotes,
  };

  for (const targetMsg of origMsgs) {
    const meta = targetMsg.metadata || {};
    const { error: updateErr } = await supabaseAdmin
      .from("messages")
      .update({
        metadata: {
          ...meta,
          poll: updatedPoll,
        },
      })
      .eq("id", targetMsg.id);

    if (updateErr) {
      console.error(
        `[${providerLabel}] Erro ao atualizar votos da enquete ${targetMsg.id}:`,
        updateErr,
      );
    } else {
      console.log(
        `[${providerLabel}] Voto de ${voterName} (${voterKey}) registrado com sucesso na enquete ${targetMsg.id}.`,
      );
    }
  }
}
