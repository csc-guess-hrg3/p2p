import { isAxiosError } from 'axios';

/**
 * Extrai uma mensagem legível para o usuário a partir de um erro de API
 * (geralmente um `AxiosError`). Cobre as três formas que o backend Nest
 * costuma devolver no payload `.response.data`:
 *
 *   1) `{ message: "texto" }`              — exceção HTTP simples
 *   2) `{ message: ["msg1", "msg2"] }`     — ValidationPipe (class-validator)
 *   3) `{ error: "texto" }`                — alguns guards/filters
 *
 * Quando nenhuma das três bate (rede caiu, CORS, JSON malformado, etc.),
 * cai num fallback genérico — mas o chamador pode passar o próprio
 * `fallback` se quiser uma mensagem mais contextual ("Tente novamente",
 * "Verifique sua conexão", etc.).
 */
export function extractApiMessage(
  err: unknown,
  fallback = 'Erro inesperado. Tente novamente.',
): string {
  if (isAxiosError(err)) {
    const data = err.response?.data as
      | { message?: string | string[]; error?: string }
      | undefined;
    if (data) {
      if (Array.isArray(data.message)) {
        return data.message.filter(Boolean).join(' ') || fallback;
      }
      if (typeof data.message === 'string' && data.message.trim()) {
        return data.message;
      }
      if (typeof data.error === 'string' && data.error.trim()) {
        return data.error;
      }
    }
    // Sem corpo no erro — tenta status + mensagem do axios.
    if (err.response?.status) {
      return `${fallback} (HTTP ${err.response.status})`;
    }
    if (err.message) return err.message;
  }
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}
