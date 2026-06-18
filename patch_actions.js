import fs from 'fs';
let code = fs.readFileSync('src/hooks/use-wavoip.tsx', 'utf8');

// Patch acceptCall
code = code.replace(
  'call.on("ended", closeCallWithDelay);',
  `call.on("ended", () => {
             upsertCallLog({
               wavoip_call_id: call.id,
               status: 'ENDED',
               ended_at: new Date().toISOString(),
               recording_url: \`https://storage.wavoip.com/\${call.id}\`
             });
             closeCallWithDelay();
          });
          const instance = instances.find((i: any) => i.wavoip_token === call.device_token);
          upsertCallLog({
            wavoip_call_id: call.id,
            whatsapp_instance_id: instance?.id,
            assigned_agent_id: profile?.id,
            direction: 'INCOMING',
            status: call.status,
            peer_number: call.peer.phone,
            started_at: new Date().toISOString(),
          });`
);

// Patch rejectCall
code = code.replace(
  'console.log("Chamada rejeitada na API Wavoip.");',
  `console.log("Chamada rejeitada na API Wavoip.");
        const instance = instances.find((i: any) => i.wavoip_token === incomingOffer.device_token);
        upsertCallLog({
          wavoip_call_id: incomingOffer.id,
          whatsapp_instance_id: instance?.id,
          assigned_agent_id: profile?.id,
          direction: 'INCOMING',
          status: 'REJECTED',
          peer_number: incomingOffer.peer.phone,
          ended_at: new Date().toISOString(),
        });`
);

// Patch startCall peerAccept
code = code.replace(
  'active.on("ended", closeCallWithDelay);',
  `active.on("ended", () => {
               upsertCallLog({
                 wavoip_call_id: active.id,
                 status: 'ENDED',
                 ended_at: new Date().toISOString(),
                 recording_url: \`https://storage.wavoip.com/\${active.id}\`
               });
               closeCallWithDelay();
             });
             upsertCallLog({
               wavoip_call_id: active.id,
               status: 'ACTIVE'
             });`
);

// Patch startCall setup
code = code.replace(
  'call.on("status", setCallStatus);',
  `call.on("status", setCallStatus);
        const instance = instances.find((i: any) => i.wavoip_token === call.device_token);
        upsertCallLog({
          wavoip_call_id: call.id,
          whatsapp_instance_id: instance?.id,
          assigned_agent_id: profile?.id,
          direction: 'OUTGOING',
          status: call.status,
          peer_number: call.peer.phone,
          started_at: new Date().toISOString(),
        });`
);

fs.writeFileSync('src/hooks/use-wavoip.tsx', code);
