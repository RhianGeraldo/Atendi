import pg from 'pg';

const connectionString = "postgresql://postgres:Erriesse2025!@db.qmkqjkzrsszzytrmdxzc.supabase.co:5432/postgres";

const sql = `
INSERT INTO ad_leads (
    company_id,
    unit_id,
    contact_id,
    ad_title,
    ad_body,
    source_url,
    thumbnail_url,
    source_id,
    ctwa_clid,
    conversion_source,
    conversion_data,
    ctwa_payload,
    source_app,
    media_type,
    created_at
)
SELECT DISTINCT ON (c.contact_id, COALESCE(m.metadata->'externalAdReply'->>'sourceID', m.metadata->'externalAdReply'->>'sourceURL'))
    co.company_id,
    c.unit_id,
    c.contact_id,
    m.metadata->'externalAdReply'->>'title' AS ad_title,
    m.metadata->'externalAdReply'->>'body' AS ad_body,
    m.metadata->'externalAdReply'->>'sourceURL' AS source_url,
    COALESCE(m.metadata->'externalAdReply'->>'thumbnailURL', m.metadata->'externalAdReply'->>'originalImageURL') AS thumbnail_url,
    COALESCE(m.metadata->'externalAdReply'->>'sourceID', m.metadata->'externalAdReply'->>'sourceURL') AS source_id,
    m.metadata->'externalAdReply'->>'ctwaClid' AS ctwa_clid,
    m.metadata->>'conversionSource' AS conversion_source,
    m.metadata->>'conversionData' AS conversion_data,
    m.metadata->>'ctwaPayload' AS ctwa_payload,
    COALESCE(m.metadata->'externalAdReply'->>'sourceApp', m.metadata->>'entryPointConversionApp') AS source_app,
    NULLIF(m.metadata->'externalAdReply'->>'mediaType', '')::integer AS media_type,
    m.created_at
FROM
    messages m
JOIN
    conversations c ON m.conversation_id = c.id
JOIN
    contacts co ON c.contact_id = co.id
WHERE
    m.metadata IS NOT NULL
    AND m.metadata->'externalAdReply' IS NOT NULL
    AND COALESCE(m.metadata->'externalAdReply'->>'sourceID', m.metadata->'externalAdReply'->>'sourceURL') IS NOT NULL
    AND NOT EXISTS (
        SELECT 1 FROM ad_leads al 
        WHERE al.contact_id = c.contact_id 
        AND al.source_id = COALESCE(m.metadata->'externalAdReply'->>'sourceID', m.metadata->'externalAdReply'->>'sourceURL')
    )
ORDER BY
    c.contact_id, COALESCE(m.metadata->'externalAdReply'->>'sourceID', m.metadata->'externalAdReply'->>'sourceURL'), m.created_at DESC;
`;

const client = new pg.Client({ 
  connectionString,
  ssl: { rejectUnauthorized: false }
});

async function run() {
  await client.connect();
  try {
    const res = await client.query(sql);
    console.log(`Migrated ${res.rowCount} old ad leads successfully!`);
  } catch (e) {
    console.error("Migration failed:", e);
  } finally {
    await client.end();
  }
}

run();
