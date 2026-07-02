const fs = require('fs');
const path = require('path');

const files = [
  'src/routes/_authenticated/conversations.tsx',
  'src/routes/_authenticated/contacts.tsx',
  'src/routes/_authenticated/pipeline.tsx',
  'src/routes/_authenticated/calls.tsx',
  'src/routes/_authenticated/tasks.tsx',
  'src/routes/_authenticated/companies.tsx',
  'src/routes/_authenticated/units.tsx'
];

files.forEach(file => {
  const filePath = path.join(__dirname, file);
  let content = fs.readFileSync(filePath, 'utf8');
  
  let modified = false;

  // 1. Add import if it doesn't exist
  if (!content.includes('import { useActiveCompany }')) {
    content = content.replace(
      'import { useAuth } from "@/lib/auth-context";',
      'import { useAuth } from "@/lib/auth-context";\nimport { useActiveCompany } from "@/lib/active-company-context";'
    );
    modified = true;
  }

  // 2. Add hook call if it doesn't exist
  // We look for `const { profile } = useAuth();` and add the new hook right after it
  if (!content.includes('const { activeCompanyId } = useActiveCompany();')) {
    content = content.replace(
      'const { profile } = useAuth();',
      'const { profile } = useAuth();\n  const { activeCompanyId } = useActiveCompany();'
    );
    // Some files might have `const { profile, user } = useAuth();`
    content = content.replace(
      'const { profile, user } = useAuth();',
      'const { profile, user } = useAuth();\n  const { activeCompanyId } = useActiveCompany();'
    );
    modified = true;
  }

  // 3. Replace all variations of profile.company_id with activeCompanyId
  const before = content;
  content = content.replace(/profile\?\.company_id/g, 'activeCompanyId');
  content = content.replace(/profile\.company_id/g, 'activeCompanyId');
  content = content.replace(/profile!\.company_id!/g, 'activeCompanyId!');
  content = content.replace(/profile!\.company_id/g, 'activeCompanyId');
  
  if (before !== content || modified) {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`Updated ${file}`);
  }
});
