import fs from 'fs';
let code = fs.readFileSync('src/components/layout/app-sidebar.tsx', 'utf8');

code = code.replace(
  '{ to: "/conversations", label: "Atendimentos", icon: MessageSquare },',
  '{ to: "/conversations", label: "Atendimentos", icon: MessageSquare },\n  { to: "/calls", label: "Ligações", icon: Phone },'
);

// Import Phone icon if not there
if (!code.includes('Phone')) {
  code = code.replace('import {', 'import { Phone,');
}

fs.writeFileSync('src/components/layout/app-sidebar.tsx', code);

let headerCode = fs.readFileSync('src/components/layout/app-header.tsx', 'utf8');
headerCode = headerCode.replace(
  '"/conversations": "Atendimentos",',
  '"/conversations": "Atendimentos",\n  "/calls": "Histórico de Ligações",'
);
fs.writeFileSync('src/components/layout/app-header.tsx', headerCode);

