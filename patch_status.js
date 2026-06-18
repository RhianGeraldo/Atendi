import fs from 'fs';
let code = fs.readFileSync('src/hooks/use-wavoip.tsx', 'utf8');

// Replace all `call.on("status", setCallStatus);` with the new robust handler
const robustStatusHandler = `
        call.on("status", (status) => {
          setCallStatus(status);
          if (status === 'ENDED' || status === 'REJECTED' || status === 'FAILED' || status === 'DISCONNECTED') {
            updateCallLog({
              wavoip_call_id: call.id,
              status,
              ended_at: new Date().toISOString(),
              recording_url: \`https://storage.wavoip.com/\${call.id}\`
            });
            setTimeout(closeCallWithDelay, 1000);
          } else {
            updateCallLog({ wavoip_call_id: call.id, status });
          }
        });`;

code = code.replace(/call\.on\("status", setCallStatus\);/g, robustStatusHandler);

// Also patch active.on("status", setCallStatus);
const robustActiveStatusHandler = `
           active.on("status", (status) => {
             setCallStatus(status);
             if (status === 'ENDED' || status === 'REJECTED' || status === 'FAILED' || status === 'DISCONNECTED') {
               updateCallLog({
                 wavoip_call_id: active.id,
                 status,
                 ended_at: new Date().toISOString(),
                 recording_url: \`https://storage.wavoip.com/\${active.id}\`
               });
               setTimeout(closeCallWithDelay, 1000);
             } else {
               updateCallLog({ wavoip_call_id: active.id, status });
             }
           });`;

code = code.replace(/active\.on\("status", setCallStatus\);/g, robustActiveStatusHandler);

// Remove the old call.on("ended") and active.on("ended") since we handle it in status now
code = code.replace(/call\.on\("ended", \(\) => \{[\s\S]*?\}\);/g, '');
code = code.replace(/active\.on\("ended", \(\) => \{[\s\S]*?\}\);/g, '');

fs.writeFileSync('src/hooks/use-wavoip.tsx', code);
