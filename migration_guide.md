# Guia de Migração do Banco de Dados Supabase

Este guia documenta o passo a passo completo da migração de dados e do schema do Atendi de um projeto Supabase antigo para uma nova instância, sem restrições de egress ou planos pagos.

---

## 1. Passo a Passo Geral da Migração

### Passo 1.1: Extração do Schema do Banco de Dados Antigo
Para obter a estrutura de tabelas, tipos, funções, triggers e políticas RLS idênticas ao banco antigo, execute o seguinte comando utilizando o `pg_dump` (substituindo com a string de conexão do banco de dados antigo):
```bash
pg_dump "postgresql://postgres:[SENHA]@db.wzwloyotlwibgfeeetly.supabase.co:5432/postgres" \
  --schema=public \
  --clean \
  --if-exists \
  --no-owner \
  --no-privileges \
  -f old_public_schema.sql
```

### Passo 1.2: Criação do Script de Migração de Dados
Para migrar os dados, usamos um script Node.js (`scripts/migrate_all_data.ts`) que conecta a ambos os bancos, limpa os dados existentes na nova base e insere os registros na ordem correta de dependência (chaves estrangeiras). O código completo deste script está na Seção 2 deste guia.

### Passo 1.3: Execução da Migração
Com as variáveis de conexão definidas no script, execute-o usando o `tsx` (ou convertendo para JS):
```bash
npx tsx scripts/migrate_all_data.ts
```

### Passo 1.4: Aplicação de Migrações Locais Restantes
Se o frontend requerer colunas que não haviam sido sincronizadas no banco antigo, aplique-as diretamente no banco novo:
```bash
PGPASSWORD="[SENHA]" psql -h db.kcirbzbdahliqcwvjifo.supabase.co -U postgres -p 5432 -d postgres -f supabase/migrations/20260620160000_add_instagram_id.sql
```

### Passo 1.5: Atualização das Credenciais Locais
Atualize o arquivo `.env` da raiz do projeto Atendi com as novas credenciais do Supabase:
- `SUPABASE_PROJECT_ID`
- `SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_URL`
- `VITE_SUPABASE_...`
- `NEXT_PUBLIC_SUPABASE_...`
- `SERVICE_ROLE`

---

## 2. Código Completo do Script de Migração (`scripts/migrate_all_data.ts`)

Aqui está o código completo que resolve dependências circulares de conversas/sessões e o autorreferenciamento de mensagens citadas:

```typescript
import pg from 'pg';
import { execSync } from 'child_process';

const { Client } = pg;

// Altere com as strings de conexão correspondentes
const OLD_DB_URL = 'postgresql://postgres:Erriesse2025!@db.wzwloyotlwibgfeeetly.supabase.co:5432/postgres';
const NEW_DB_URL = 'postgresql://postgres:Erriesse2025!@db.kcirbzbdahliqcwvjifo.supabase.co:5432/postgres';

// Ordem cronológica correta das tabelas para respeitar chaves estrangeiras
const TABLES_TO_MIGRATE = [
  'auth.users',
  'auth.identities',
  'public.companies',
  'public.units',
  'public.departments',
  'public.profiles',
  'public.user_units',
  'public.user_departments',
  'public.resolution_reasons',
  'public.whatsapp_instances',
  'public.ai_agents',
  'public.contacts',
  'public.conversations',      // Insere com current_session_id = NULL inicialmente
  'public.messages',           // Insere com quoted_message_id = NULL inicialmente
  'public.pipelines',
  'public.pipeline_stages',
  'public.opportunities',
  'public.tasks',
  'public.labels',
  'public.contact_labels',
  'public.contact_notes',
  'public.quick_message_folders',
  'public.quick_messages',
  'public.conversation_sessions',
  'public.opportunity_notes',
  'public.session_events',
  'public.ad_leads',
  'public.call_logs',
  'public.whatsapp_templates'
];

function formatValue(val: any, dataType: string) {
  if (val === null || val === undefined) {
    return null;
  }
  if (dataType === 'json' || dataType === 'jsonb') {
    return JSON.stringify(val);
  }
  if (val instanceof Date) {
    return val;
  }
  if (Array.isArray(val)) {
    return val;
  }
  if (typeof val === 'object') {
    return JSON.stringify(val);
  }
  return val;
}

const conversationSessionMappings: Array<{ id: string; current_session_id: string }> = [];
const messageQuotedMappings: Array<{ id: string; quoted_message_id: string }> = [];

async function migrateTable(oldClient: pg.Client, newClient: pg.Client, tableName: string) {
  console.log(`\n--- Iniciando migração para a tabela: ${tableName} ---`);
  
  const parts = tableName.split('.');
  const schemaName = parts[0];
  const simpleTableName = parts[1];
  
  const colQuery = `
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_schema = $1 
      AND table_name = $2 
      AND is_generated != 'ALWAYS'
  `;
  
  const colRes = await newClient.query(colQuery, [schemaName, simpleTableName]);
  const columnsInfo = colRes.rows;
  
  if (columnsInfo.length === 0) {
    console.error(`Não foram encontradas colunas para a tabela ${tableName}. Pulando.`);
    return 0;
  }
  
  const columns = columnsInfo.map(c => c.column_name);
  const dataTypeMap = new Map<string, string>();
  for (const col of columnsInfo) {
    dataTypeMap.set(col.column_name, col.data_type);
  }
  
  const columnsList = columns.map(c => `"${c}"`).join(', ');
  
  const selectQuery = `SELECT ${columnsList} FROM ${tableName}`;
  const selectRes = await oldClient.query(selectQuery);
  const rows = selectRes.rows;
  console.log(`Buscados ${rows.length} registros da base antiga.`);
  
  if (rows.length === 0) {
    console.log(`Tabela ${tableName} vazia, pulando.`);
    return 0;
  }
  
  const BATCH_SIZE = 500;
  let migratedCount = 0;
  
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const chunk = rows.slice(i, i + BATCH_SIZE);
    const placeholders: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;
    
    for (const row of chunk) {
      const rowPlaceholders: string[] = [];
      for (const col of columns) {
        rowPlaceholders.push(`$${paramIndex++}`);
        const dataType = dataTypeMap.get(col) || '';
        
        if (tableName === 'public.conversations' && col === 'current_session_id') {
          if (row[col]) {
            conversationSessionMappings.push({ id: row.id, current_session_id: row[col] });
          }
          values.push(null);
        } 
        else if (tableName === 'public.messages' && col === 'quoted_message_id') {
          if (row[col]) {
            messageQuotedMappings.push({ id: row.id, quoted_message_id: row[col] });
          }
          values.push(null);
        }
        else {
          values.push(formatValue(row[col], dataType));
        }
      }
      placeholders.push(`(${rowPlaceholders.join(', ')})`);
    }
    
    const insertQuery = `INSERT INTO ${tableName} (${columnsList}) VALUES ${placeholders.join(', ')}`;
    
    try {
      await newClient.query(insertQuery, values);
      migratedCount += chunk.length;
      console.log(`Lote migrado: ${migratedCount}/${rows.length} registros.`);
    } catch (err: any) {
      console.error(`Erro ao migrar lote na tabela ${tableName}:`, err.message);
      throw err;
    }
  }
  
  console.log(`Sucesso ao migrar ${migratedCount} registros para ${tableName}.`);
  return migratedCount;
}

async function main() {
  const oldClient = new Client({ connectionString: OLD_DB_URL });
  const newClient = new Client({ connectionString: NEW_DB_URL });
  
  try {
    console.log('Conectando aos bancos de dados...');
    await Promise.all([oldClient.connect(), newClient.connect()]);
    console.log('Conectado com sucesso!');
    
    // 1. Resetar banco de destino
    console.log('\n[1/6] Resetando banco de dados de destino...');
    await newClient.query('DELETE FROM auth.identities');
    await newClient.query('DELETE FROM auth.users');
    await newClient.query('DROP SCHEMA IF EXISTS public CASCADE');
    await newClient.query('CREATE SCHEMA public');
    await newClient.query('GRANT ALL ON SCHEMA public TO postgres');
    await newClient.query('GRANT ALL ON SCHEMA public TO public');
    await newClient.query('GRANT ALL ON SCHEMA public TO anon');
    await newClient.query('GRANT ALL ON SCHEMA public TO authenticated');
    await newClient.query('GRANT ALL ON SCHEMA public TO service_role');
    
    // 2. Aplicar Schema Dump
    console.log('\n[2/6] Aplicando schema dump (old_public_schema.sql) no banco de destino...');
    execSync(
      'PGPASSWORD="Erriesse2025!" psql -h db.kcirbzbdahliqcwvjifo.supabase.co -U postgres -p 5432 -d postgres -f old_public_schema.sql',
      { stdio: 'inherit' }
    );
    console.log('Schema aplicado com sucesso.');
    
    // 3. Remover Triggers temporariamente
    console.log('\n[3/6] Removendo triggers temporariamente para evitar efeitos colaterais...');
    await newClient.query('DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users');
    await newClient.query('DROP TRIGGER IF EXISTS on_message_inserted ON public.messages');
    await newClient.query('DROP TRIGGER IF EXISTS trigger_sync_call_log_to_messages ON public.call_logs');
    console.log('Triggers removidos.');
    
    // 4. Migrar dados das tabelas
    console.log('\n[4/6] Iniciando migração dos dados...');
    const summary: { [key: string]: number } = {};
    for (const tableName of TABLES_TO_MIGRATE) {
      const count = await migrateTable(oldClient, newClient, tableName);
      summary[tableName] = count;
    }
    
    // 5. Resolver dependência cíclica de conversations.current_session_id
    if (conversationSessionMappings.length > 0) {
      console.log(`\n[5/6] Resolvendo dependências cíclicas para ${conversationSessionMappings.length} conversas...`);
      const BATCH_SIZE = 500;
      for (let i = 0; i < conversationSessionMappings.length; i += BATCH_SIZE) {
        const chunk = conversationSessionMappings.slice(i, i + BATCH_SIZE);
        const placeholders: string[] = [];
        const values: any[] = [];
        let paramIndex = 1;
        for (const item of chunk) {
          placeholders.push(`($${paramIndex++}::uuid, $${paramIndex++}::uuid)`);
          values.push(item.id, item.current_session_id);
        }
        const updateQuery = `
          UPDATE public.conversations AS c
          SET current_session_id = v.current_session_id
          FROM (VALUES ${placeholders.join(', ')}) AS v(id, current_session_id)
          WHERE c.id = v.id
        `;
        await newClient.query(updateQuery, values);
      }
      console.log('Dependências cíclicas resolvidas.');
    }

    // 6. Resolver dependência autorreferenciada de messages.quoted_message_id
    if (messageQuotedMappings.length > 0) {
      console.log(`\n[6/6] Resolving self-referential dependencies for ${messageQuotedMappings.length} messages...`);
      const BATCH_SIZE = 500;
      for (let i = 0; i < messageQuotedMappings.length; i += BATCH_SIZE) {
        const chunk = messageQuotedMappings.slice(i, i + BATCH_SIZE);
        const placeholders: string[] = [];
        const values: any[] = [];
        let paramIndex = 1;
        for (const item of chunk) {
          placeholders.push(`($${paramIndex++}::uuid, $${paramIndex++}::uuid)`);
          values.push(item.id, item.quoted_message_id);
        }
        const updateQuery = `
          UPDATE public.messages AS m
          SET quoted_message_id = v.quoted_message_id
          FROM (VALUES ${placeholders.join(', ')}) AS v(id, quoted_message_id)
          WHERE m.id = v.id
        `;
        await newClient.query(updateQuery, values);
      }
      console.log('Dependências autorreferenciadas resolvidas.');
    }
    
    // 7. Recriar Triggers
    console.log('\nRecriando triggers...');
    await newClient.query(`
      CREATE TRIGGER on_auth_user_created
      AFTER INSERT ON auth.users
      FOR EACH ROW EXECUTE FUNCTION public.handle_new_user()
    `);
    await newClient.query(`
      CREATE TRIGGER on_message_inserted
      AFTER INSERT ON public.messages
      FOR EACH ROW EXECUTE FUNCTION public.update_conversation_on_message()
    `);
    await newClient.query(`
      CREATE TRIGGER trigger_sync_call_log_to_messages
      BEFORE INSERT OR UPDATE ON public.call_logs
      FOR EACH ROW EXECUTE FUNCTION public.handle_call_log_message_sync()
    `);
    console.log('Triggers recriados.');
    
    console.log('\n=====================================');
    console.log('MIGRAÇÃO CONCLUÍDA COM SUCESSO!');
    console.table(summary);
    console.log('=====================================');
    
  } catch (error) {
    console.error('\nFalha crítica na migração:', error);
    process.exit(1);
  } finally {
    await Promise.all([oldClient.end(), newClient.end()]);
  }
}

main();
```
