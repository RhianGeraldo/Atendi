-- Update lead routing constraint to be per-department
ALTER TABLE lead_routing_configs DROP CONSTRAINT IF EXISTS lead_routing_configs_company_id_key;
DROP INDEX IF EXISTS lead_routing_configs_company_unit_idx;

-- Clean duplicates if any (keep latest) before applying unique index
DELETE FROM lead_routing_configs a USING (
    SELECT MIN(ctid) as ctid, company_id, unit_id, department_id
    FROM lead_routing_configs 
    GROUP BY company_id, unit_id, department_id HAVING COUNT(*) > 1
) b
WHERE a.company_id = b.company_id 
  AND coalesce(a.unit_id, '00000000-0000-0000-0000-000000000000'::uuid) = coalesce(b.unit_id, '00000000-0000-0000-0000-000000000000'::uuid)
  AND coalesce(a.department_id, '00000000-0000-0000-0000-000000000000'::uuid) = coalesce(b.department_id, '00000000-0000-0000-0000-000000000000'::uuid)
  AND a.ctid <> b.ctid;

-- Create unique constraint covering department
CREATE UNIQUE INDEX IF NOT EXISTS lead_routing_configs_dept_idx 
ON lead_routing_configs (company_id, coalesce(unit_id, '00000000-0000-0000-0000-000000000000'::uuid), coalesce(department_id, '00000000-0000-0000-0000-000000000000'::uuid));
