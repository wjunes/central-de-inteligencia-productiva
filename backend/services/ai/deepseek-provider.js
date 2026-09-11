// Implementacion real (fetch-based) del proveedor primario. NUNCA se llama
// desde el pipeline deterministico ni desde el modo fixture/test de esta
// etapa - queda disponible para una capa futura de explicacion (prompt
// seccion 23-24). La API key se lee de process.env y nunca se registra en
// logs ni se expone en respuestas (ver config.js:safeLogFields).
import { AIProvider } from './provider.js';
import { config } from '../../config.js';

export class DeepSeekProvider extends AIProvider {
  constructor({ apiKey = config.ai.deepseek.apiKey, baseUrl = config.ai.deepseek.baseUrl, model = 'deepseek-chat' } = {}) {
    super();
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
    this.model = model;
  }

  isConfigured() {
    return Boolean(this.apiKey);
  }

  async generate(prompt, { maxTokens = 512 } = {}) {
    if (!this.isConfigured()) throw new Error('DeepSeekProvider: DEEPSEEK_API_KEY no configurada');
    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.apiKey}` },
      body: JSON.stringify({ model: this.model, messages: [{ role: 'user', content: prompt }], max_tokens: maxTokens }),
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) throw new Error(`DeepSeekProvider: HTTP ${res.status}`);
    const json = await res.json();
    return json.choices?.[0]?.message?.content ?? '';
  }

  async analyze(input, opts) {
    return this.generate(`Analiza de forma neutral el siguiente contexto estructurado (no infieras mas alla de la evidencia dada):\n${JSON.stringify(input)}`, opts);
  }

  async summarize(input, opts) {
    return this.generate(`Resume en lenguaje natural, sin agregar recomendaciones nuevas, la siguiente estructura:\n${JSON.stringify(input)}`, opts);
  }
}
