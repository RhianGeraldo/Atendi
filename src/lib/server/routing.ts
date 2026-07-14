import { supabaseAdmin } from '@/integrations/supabase/client.server';

export async function assignDepartmentRoundRobin(companyId: string, departmentId: string, unitId: string | null = null): Promise<string | null> {
  try {
    // 1. Fetch config for this specific department
    let q = supabaseAdmin
      .from('lead_routing_configs')
      .select('*')
      .eq('company_id', companyId)
      .eq('department_id', departmentId)
      .eq('is_active', true);
      
    if (unitId) {
      q = q.eq('unit_id', unitId);
    } else {
      q = q.is('unit_id', null);
    }

    const { data: config, error: fetchErr } = await q.maybeSingle();

    if (fetchErr || !config) {
      return null; // Department round robin not active
    }

    // 2. Determine active agents dynamically for this department
    const { data: rawAgents, error: agentsErr } = await supabaseAdmin
      .from('profiles')
      .select('id, has_matriz_access, user_units(unit_id)')
      .eq('company_id', companyId)
      .eq('department_id', departmentId)
      .eq('active', true);

    if (agentsErr || !rawAgents || rawAgents.length === 0) {
      console.log(`[Routing] No active agents found for department ${departmentId}`);
      return null;
    }

    // Filter by unit if necessary
    const validAgents = rawAgents.filter(a => {
      if (!unitId) return true; // Global scope
      if (a.has_matriz_access) return true;
      return a.user_units?.some((uu: any) => uu.unit_id === unitId);
    });

    if (validAgents.length === 0) {
      console.log(`[Routing] No valid agents after unit filter for unit ${unitId}`);
      return null;
    }

    // Sort deterministically to maintain sequence
    validAgents.sort((a, b) => a.id.localeCompare(b.id));

    const agentIds = validAgents.map(a => a.id);

    // 3. Determine next agent
    const lastIndex = typeof config.last_assigned_index === 'number' ? config.last_assigned_index : -1;
    const nextIndex = (lastIndex + 1) % agentIds.length;
    const nextAgentId = agentIds[nextIndex];

    // 4. Update the config with the new index
    await supabaseAdmin
      .from('lead_routing_configs')
      .update({ last_assigned_index: nextIndex })
      .eq('id', config.id);

    return nextAgentId;
  } catch (error) {
    console.error("[Routing] Error assigning department round robin:", error);
    return null;
  }
}
