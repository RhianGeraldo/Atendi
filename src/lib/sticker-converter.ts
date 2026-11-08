/**
 * Utilitário para conversão e otimização de imagens em figurinhas WebP (Stickers).
 *
 * Requisitos do WhatsApp (Meta Cloud API e Evolution API / EvoGo / Stevo):
 * - Formato: image/webp
 * - Dimensões máximas: 512x512 pixels
 * - Transparência preservada (RGBA / Canal Alfa)
 * - Tamanho ideal: < 100 KB para estático (obrigatório na Cloud API)
 */

export interface ConvertedSticker {
  blob: Blob;
  dataUrl: string;
  width: number;
  height: number;
  sizeBytes: number;
}

/**
 * Converte um arquivo ou Blob de imagem em uma figurinha WebP otimizada para WhatsApp.
 */
export async function convertImageToStickerWebp(
  fileOrBlob: File | Blob,
  maxDimension = 512,
): Promise<ConvertedSticker> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(fileOrBlob);

    img.onload = async () => {
      URL.revokeObjectURL(objectUrl);

      try {
        let width = img.naturalWidth || img.width;
        let height = img.naturalHeight || img.height;

        if (!width || !height) {
          throw new Error("Não foi possível determinar as dimensões da imagem.");
        }

        // Calcula proporção para caber em maxDimension x maxDimension mantendo aspect ratio
        if (width > maxDimension || height > maxDimension) {
          if (width >= height) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          } else {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext("2d", { willReadFrequently: false });
        if (!ctx) {
          throw new Error("Não foi possível inicializar o contexto 2D do Canvas.");
        }

        // Limpa com transparência total (sem fundo branco)
        ctx.clearRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);

        // Função auxiliar para exportar canvas para Blob WebP com ajuste dinâmico de qualidade
        const exportWebp = (quality: number): Promise<Blob> => {
          return new Promise((res, rej) => {
            canvas.toBlob(
              (blob) => {
                if (blob) res(blob);
                else rej(new Error("Falha ao gerar WebP a partir do Canvas."));
              },
              "image/webp",
              quality,
            );
          });
        };

        // Tenta com qualidade 0.85; se passar de 98 KB (para garantir margem segura para os 100KB da Meta Cloud API), diminui a qualidade
        let quality = 0.85;
        let blob = await exportWebp(quality);

        while (blob.size > 98 * 1024 && quality > 0.3) {
          quality -= 0.15;
          blob = await exportWebp(quality);
        }

        // Converte o Blob para Data URL (Base64)
        const reader = new FileReader();
        reader.onloadend = () => {
          const dataUrl = reader.result as string;
          resolve({
            blob,
            dataUrl,
            width,
            height,
            sizeBytes: blob.size,
          });
        };
        reader.onerror = () => reject(new Error("Erro ao ler o blob gerado."));
        reader.readAsDataURL(blob);
      } catch (err) {
        reject(err);
      }
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Falha ao carregar a imagem para conversão em figurinha."));
    };

    img.src = objectUrl;
  });
}
