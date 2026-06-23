export function parseEvogoError(status: number, statusText: string, errorText: string) {
  let errorMessage = `Failed to send message via EvoGo: ${status} ${statusText}`;
  try {
    const json = JSON.parse(errorText);
    if (json.error) errorMessage = json.error;
    else if (json.message) errorMessage = json.message;
  } catch (e) {
    // ignore
  }
  return errorMessage;
}
console.log(parseEvogoError(500, 'Internal Server Error', '{"error":"number +5511999999999@s.whatsapp.net is not registered on WhatsApp"}'));
