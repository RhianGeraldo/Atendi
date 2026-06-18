import fs from 'fs';
let code = fs.readFileSync('src/hooks/use-wavoip.tsx', 'utf8');

const helper = `
  const upsertCallLog = async (data: any) => {
    if (!profile?.company_id) return;
    try {
      let contact_id = data.contact_id;
      if (!contact_id && data.peer_number) {
        const phoneSuffix = data.peer_number.replace(/\\D/g, "").slice(-8);
        const { data: contacts } = await supabase.from('contacts').select('id').eq('company_id', profile.company_id).ilike('phone', \`%\${phoneSuffix}%\`).limit(1);
        if (contacts && contacts.length > 0) contact_id = contacts[0].id;
      }
      
      const payload: any = {
        wavoip_call_id: data.wavoip_call_id,
        company_id: profile.company_id,
        direction: data.direction,
        status: data.status,
      };
      
      if (data.whatsapp_instance_id !== undefined) payload.whatsapp_instance_id = data.whatsapp_instance_id;
      if (contact_id !== undefined) payload.contact_id = contact_id;
      if (data.assigned_agent_id !== undefined) payload.assigned_agent_id = data.assigned_agent_id;
      if (data.started_at !== undefined) payload.started_at = data.started_at;
      if (data.ended_at !== undefined) payload.ended_at = data.ended_at;
      if (data.duration_seconds !== undefined) payload.duration_seconds = data.duration_seconds;
      if (data.recording_url !== undefined) payload.recording_url = data.recording_url;
      if (data.peer_number !== undefined) payload.peer_number = data.peer_number;

      const { error } = await supabase.from('call_logs').upsert(payload, { onConflict: 'wavoip_call_id' });
      if (error) console.error("[Wavoip] Erro ao salvar log:", error);
    } catch (e) {
      console.error("[Wavoip] Exceção log:", e);
    }
  };
`;

code = code.replace('  const [connectingPhone, setConnectingPhone] = useState<string | null>(null);', '  const [connectingPhone, setConnectingPhone] = useState<string | null>(null);\n' + helper);

fs.writeFileSync('src/hooks/use-wavoip.tsx', code);
