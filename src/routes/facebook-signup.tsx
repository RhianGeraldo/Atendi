import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Facebook, Loader2, CheckCircle2, XCircle } from "lucide-react";

export const Route = createFileRoute("/facebook-signup")({
  component: FacebookSignupCallback,
});

function FacebookSignupCallback() {
  const [status, setStatus] = useState<"processing" | "success" | "error">("processing");
  const search = Route.useSearch() as { code?: string; error?: string; error_description?: string };

  useEffect(() => {
    // Simulando ou processando a verificação de código
    if (search.error) {
      setStatus("error");
      return;
    }

    if (search.code) {
      // Futuro: enviar 'search.code' para o backend trocar por access_token
      setTimeout(() => {
        setStatus("success");
        // window.close() ou window.location.href = '/settings'
      }, 2000);
    } else {
      setStatus("error");
    }
  }, [search]);

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
      <div className="bg-white p-8 rounded-2xl shadow-xl max-w-md w-full text-center space-y-6">
        <div className="flex justify-center">
          <div className="h-16 w-16 bg-blue-100 rounded-full flex items-center justify-center">
            <Facebook className="h-8 w-8 text-blue-600" />
          </div>
        </div>
        
        <div className="space-y-2">
          <h1 className="text-2xl font-bold text-slate-900">
            {status === "processing" && "Conectando Facebook..."}
            {status === "success" && "Conexão Estabelecida!"}
            {status === "error" && "Erro na Conexão"}
          </h1>
          <p className="text-slate-500">
            {status === "processing" && "Aguarde enquanto vinculamos a sua página. Não feche esta janela."}
            {status === "success" && "Sua conta do Facebook foi vinculada com sucesso. Você já pode fechar esta janela."}
            {status === "error" && (search.error_description || "Não foi possível validar o código de acesso da Meta.")}
          </p>
        </div>

        <div className="pt-4 flex justify-center">
          {status === "processing" && <Loader2 className="h-8 w-8 text-blue-600 animate-spin" />}
          {status === "success" && <CheckCircle2 className="h-12 w-12 text-emerald-500" />}
          {status === "error" && <XCircle className="h-12 w-12 text-destructive" />}
        </div>
        
        {status !== "processing" && (
          <button 
            onClick={() => window.close()}
            className="mt-4 px-6 py-2 bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition-colors"
          >
            Fechar Janela
          </button>
        )}
      </div>
    </div>
  );
}
