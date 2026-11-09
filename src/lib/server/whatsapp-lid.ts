import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getPhoneVariants } from "@/lib/utils";

/**
 * Resolução LID -> telefone do WhatsApp.
 *
 * Alguns contatos (ex.: leads de anúncio) chegam só com o @lid; o número real
 * vem depois, em outro evento. Estas funções guardam o par (tabela
 * whatsapp_lid_map) e corrigem o contato provisório (telefone = LID) em vez
 * de deixar o webhook criar um segundo contato com o número real.
 *
 * Nenhuma delas lança: qualquer falha é só registrada no log e o webhook segue
 * o fluxo normal — elas nunca podem impedir uma mensagem de ser salva.
 */

/** Telefone que na verdade é um LID (contato provisório). */
export function isProvisionalPhone(phone: string | null | undefined, lid?: string | null): boolean {
  if (!phone) return false;
  if (lid && phone === lid) return true;
  return /^\d{14,}$/.test(phone) && !phone.startsWith("55");
}

function isUsablePair(lid: string | null | undefined, phone: string | null | undefined) {
  return !!lid && !!phone && lid !== phone && /^\d+$/.test(phone) && !isProvisionalPhone(phone, lid);
}

/** Guarda o par LID -> telefone da empresa. */
export async function rememberLid(companyId: string, lid: string, phone: string, source: string) {
  if (!isUsablePair(lid, phone)) return;
  try {
    const { error } = await (supabaseAdmin.from("whatsapp_lid_map" as any) as any).upsert(
      { company_id: companyId, lid, phone, source, updated_at: new Date().toISOString() },
      { onConflict: "company_id,lid" },
    );
    if (error) throw error;
  } catch (err) {
    console.error("[whatsapp-lid] Falha ao guardar LID:", lid, err);
  }
}

/** Telefone conhecido para o LID, ou null. */
export async function resolveLidPhone(companyId: string, lid: string): Promise<string | null> {
  try {
    const { data, error } = await (supabaseAdmin.from("whatsapp_lid_map" as any) as any)
      .select("phone")
      .eq("company_id", companyId)
      .eq("lid", lid)
      .maybeSingle();
    if (error) throw error;
    return data?.phone || null;
  } catch (err) {
    console.error("[whatsapp-lid] Falha ao consultar LID:", lid, err);
    return null;
  }
}

/**
 * Corrige o contato provisório (telefone = LID) com o número real.
 * Se já existir outro contato com o número real, não mexe: os dois precisam
 * ser mesclados (o webhook não faz merge para continuar rápido e seguro).
 * Retorna true se algum contato foi corrigido.
 */
export async function promoteProvisionalContact(
  companyId: string,
  lid: string,
  phone: string,
): Promise<boolean> {
  if (!isUsablePair(lid, phone)) return false;
  try {
    const { data: provisional, error: pErr } = await supabaseAdmin
      .from("contacts")
      .select("id, name")
      .eq("company_id", companyId)
      .eq("phone", lid)
      .is("merged_into_id", null)
      .limit(1);
    if (pErr) throw pErr;
    const target = provisional?.[0];
    if (!target) return false;

    const { data: realContacts, error: rErr } = await supabaseAdmin
      .from("contacts")
      .select("id")
      .eq("company_id", companyId)
      .in("phone", getPhoneVariants(phone))
      .is("merged_into_id", null)
      .limit(1);
    if (rErr) throw rErr;
    if (realContacts && realContacts.length > 0) {
      const realId = realContacts[0].id;
      console.log(
        `[whatsapp-lid] Contato provisório ${target.id} (LID ${lid}) duplica contato real ${realId} (${phone}); vinculando e mesclando.`,
      );

      // Vincula o LID no contato real
      await supabaseAdmin
        .from("contacts")
        .update({ whatsapp_lid: lid })
        .eq("id", realId);

      // Marca o contato provisório como mesclado para não aparecer nas listas
      await supabaseAdmin
        .from("contacts")
        .update({ merged_into_id: realId })
        .eq("id", target.id);

      // Limpa ou migra conversas do contato provisório para não poluir o painel nem perder mensagens
      const { data: provConvs } = await supabaseAdmin
        .from("conversations")
        .select("id, whatsapp_instance_id")
        .eq("contact_id", target.id);

      for (const pc of provConvs || []) {
        // Busca a conversa real nesta mesma instância (ou a mais recente do contato real)
        const { data: realConv } = await supabaseAdmin
          .from("conversations")
          .select("id")
          .eq("contact_id", realId)
          .eq("whatsapp_instance_id", pc.whatsapp_instance_id)
          .order("started_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (realConv && realConv.id !== pc.id) {
          // Migra todas as mensagens da conversa provisória para a conversa real
          await supabaseAdmin
            .from("messages")
            .update({ conversation_id: realConv.id })
            .eq("conversation_id", pc.id);
        }

        // Quebra referência circular de chave estrangeira
        await supabaseAdmin
          .from("conversations")
          .update({ current_session_id: null })
          .eq("id", pc.id);

        const { data: sessList } = await supabaseAdmin
          .from("conversation_sessions")
          .select("id")
          .eq("conversation_id", pc.id);
        const sIds = (sessList || []).map((s) => s.id);
        if (sIds.length > 0) {
          await supabaseAdmin.from("session_events").delete().in("session_id", sIds);
        }
        await supabaseAdmin.from("conversation_sessions").delete().eq("conversation_id", pc.id);
        await supabaseAdmin.from("conversations").delete().eq("id", pc.id);
        console.log(`[whatsapp-lid] Conversa fantasma ${pc.id} removida e mesclada na real ${realConv?.id || "sem-conversa"}.`);
      }
      return true;
    }

    const updates: { phone: string; whatsapp_lid: string; name?: string } = {
      phone,
      whatsapp_lid: lid,
    };
    if (target.name === lid) updates.name = phone;
    const { error: uErr } = await supabaseAdmin.from("contacts").update(updates).eq("id", target.id);
    if (uErr) throw uErr;

    console.log(`[whatsapp-lid] Contato ${target.id}: LID ${lid} -> ${phone}`);
    return true;
  } catch (err) {
    console.error("[whatsapp-lid] Falha ao corrigir contato provisório:", lid, err);
    return false;
  }
}

/**
 * Eco de mensagem enviada pelo próprio sistema chegou só com o número real.
 * Acha a mensagem pelo ID (o envio grava depois que a API responde, então
 * tenta de novo após uma pausa curta) e, se a conversa é de um contato
 * provisório, aprende o par e corrige o contato. Retorna true se corrigiu.
 */
export async function learnLidFromOwnMessage(
  companyId: string,
  remoteMsgId: string,
  phone: string,
): Promise<boolean> {
  try {
    const findContact = async () => {
      const { data, error } = await supabaseAdmin
        .from("messages")
        .select("conversations(contact_id, contacts(id, company_id, phone, whatsapp_lid))")
        .eq("remote_msg_id", remoteMsgId)
        .maybeSingle();
      if (error) throw error;
      return (data as any)?.conversations?.contacts || null;
    };

    let contact = await findContact();
    if (!contact) {
      await new Promise((r) => setTimeout(r, 1500));
      contact = await findContact();
    }
    if (!contact || contact.company_id !== companyId) return false;
    if (!isProvisionalPhone(contact.phone, contact.whatsapp_lid)) return false;

    const lid = contact.whatsapp_lid || contact.phone;
    await rememberLid(companyId, lid, phone, "echo");
    return await promoteProvisionalContact(companyId, lid, phone);
  } catch (err) {
    console.error("[whatsapp-lid] Falha ao aprender LID pelo eco:", remoteMsgId, err);
    return false;
  }
}

/**
 * Cria o contato; se outro webhook acabou de criar o mesmo telefone na mesma
 * empresa (índice único uq_contacts_company_phone_novos), devolve o dele em vez
 * de falhar ou duplicar. Lança nos demais erros.
 */
export async function insertContactOrFindExisting<T extends string>(
  row: { company_id: string; phone: string | null } & Record<string, unknown>,
  columns: T,
) {
  const { data, error } = await supabaseAdmin.from("contacts").insert(row as any).select(columns).single();
  if (!error) return data as any;
  if (error.code !== "23505" || !row.phone) throw error;

  const variants = getPhoneVariants(row.phone);
  const phones = variants.length > 0 ? variants : [row.phone];

  let { data: existing, error: fErr } = await supabaseAdmin
    .from("contacts")
    .select(columns)
    .eq("company_id", row.company_id)
    .in("phone", phones)
    .is("merged_into_id", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (fErr || !existing) {
    const { data: merged } = await supabaseAdmin
      .from("contacts")
      .select(columns)
      .eq("company_id", row.company_id)
      .in("phone", phones)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (merged) existing = merged;
  }

  if (!existing) throw error;
  console.warn(`[whatsapp-lid] Corrida na criação do contato ${row.phone}: reaproveitando o existente.`);
  return existing as any;
}
