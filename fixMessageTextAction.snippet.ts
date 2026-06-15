export const fixMessageTextAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({
    conversationId: z.string().uuid(),
    text: z.string().min(1),
  }))
  .handler(async ({ data, context }) => {
    const { userId } = context;

    const { data: conv } = await supabaseAdmin
      .from("conversations")
      .select("contacts(company_id)")
      .eq("id", data.conversationId)
      .single();

    const companyId = conv?.contacts?.company_id;
    if (!companyId) throw new Error("ID da empresa não encontrado.");

    const { data: company } = await supabaseAdmin
      .from('companies')
      .select('ai_settings')
      .eq('id', companyId)
      .single();

    if (!company?.ai_settings?.engines?.text || company.ai_settings.engines.text === 'none') {
      throw new Error("Geração de IA não está habilitada.");
    }

    const provider = company.ai_settings.engines.text;
    const apiKey = company.ai_settings.keys?.[provider as keyof typeof company.ai_settings.keys];

    if (!apiKey) {
      throw new Error(`Nenhuma chave de API configurada para o provedor: ${provider}`);
    }

    const systemPrompt = "Você é um revisor de texto de atendimento ao cliente. Reescreva o texto a seguir corrigindo erros gramaticais, de ortografia e de pontuação. Mantenha o texto amigável, profissional e com a mesma intenção original. Não adicione novas informações nem responda à mensagem, APENAS retorne o texto corrigido.";
    
    let correctedText = data.text;

    if (provider === 'openai') {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'gpt-4o',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: data.text }
          ],
          temperature: 0.3
        })
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error?.message || "Failed to fix text");
      correctedText = json.choices[0]?.message?.content || data.text;
    } else if (provider === 'openrouter') {
      const model = company.ai_settings.models?.text || 'openai/gpt-4o';
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: data.text }
          ],
          temperature: 0.3
        })
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error?.message || "Failed to fix text");
      correctedText = json.choices[0]?.message?.content || data.text;
    }

    return { text: correctedText.trim() };
  });
