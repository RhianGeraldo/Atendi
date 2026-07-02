    // UPDATE PARA O SALES COACH ACTION

    let systemPrompt = aiSettings.sales_coach_prompt || "Você é um treinador de vendas de elite.";
    systemPrompt += "\n\nO usuário enviará o histórico recente de uma conversa. Sua tarefa é analisar o atendimento e gerar uma tabela de análise em Markdown (exatamente com as colunas: Item, Avaliação e Trechos de Referência). Avalie Abertura, Descoberta de necessidades, Comunicação, Técnicas de Vendas, Oportunidades Perdidas e Erros. No final da tabela dê Notas de 0 a 10 para Empatia, Qualificação, Persuasão e uma Nota Geral. Finalize com um Resumo Executivo em bullet points.";
    
    // ... [código de fetch] ...
    
    // depois de obter a resposta (suggestion):
    
    // 4. Salvar Análise no Banco
    const { data: insertedAnalysis, error: insertError } = await supabaseAdmin
      .from('sales_coach_analyses')
      .insert({
        conversation_id: data.conversationId,
        company_id: companyId,
        analysis_markdown: suggestion,
        created_by: userId
      })
      .select()
      .single();
      
    if (insertError) {
      console.error("Erro ao salvar análise:", insertError);
    }
