import fs from 'fs';
let code = fs.readFileSync('src/hooks/use-wavoip.tsx', 'utf8');

const helper = `
  const updateCallLog = async (data: any) => {
    try {
      const payload: any = {};
      if (data.status !== undefined) payload.status = data.status;
      if (data.ended_at !== undefined) payload.ended_at = data.ended_at;
      if (data.recording_url !== undefined) payload.recording_url = data.recording_url;

      const { error } = await supabase.from('call_logs').update(payload).eq('wavoip_call_id', data.wavoip_call_id);
      if (error) console.error("[Wavoip] Erro ao atualizar log:", error);
    } catch (e) {
      console.error("[Wavoip] Exceção update log:", e);
    }
  };
`;

code = code.replace('  const upsertCallLog = async (data: any) => {', helper + '\n  const upsertCallLog = async (data: any) => {');

// Replace upsertCallLog with updateCallLog where appropriate
code = code.replace(/upsertCallLog\(\{\s*wavoip_call_id: active\.id,\s*status: 'ENDED'/g, "updateCallLog({\n                 wavoip_call_id: active.id,\n                 status: 'ENDED'");
code = code.replace(/upsertCallLog\(\{\s*wavoip_call_id: active\.id,\s*status: 'ACTIVE'/g, "updateCallLog({\n               wavoip_call_id: active.id,\n               status: 'ACTIVE'");
code = code.replace(/upsertCallLog\(\{\s*wavoip_call_id: call\.id,\s*status: 'ENDED'/g, "updateCallLog({\n               wavoip_call_id: call.id,\n               status: 'ENDED'");

fs.writeFileSync('src/hooks/use-wavoip.tsx', code);
