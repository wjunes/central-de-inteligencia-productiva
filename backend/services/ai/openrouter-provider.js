// Proveedor de fallback (prompt seccion 23). Misma interfaz que
// DeepSeekProvider - un consumidor no deberia notar la diferencia. Tampoco
// se llama desde el pipeline ni desde los tests de esta etapa.
import { AIProvider } from './provider.js';
import { config } from '../../config.js';

export class OpenRouterProvider extends AIProvider {
  constructor({ apiKey = config.ai.openrouter.apiKey, baseUrl = config.ai.openrouter.baseUrl, model = 'deepseek/deepseek-chat' } = {}) {
    super();
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
    this.model = model;
  }

  isConfigured() {
    return Boolean(this.apiKey);
  }

  async generate(prompt, { maxTokens = 512 } = {}) {
    if (!this.isConfigured()) throw new Error('OpenRouterProvider: OPENROUTER_API_KEY no configurada');
    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.apiKey}` },
      body: JSON.stringify({ model: this.model, messages: [{ role: 'user', content: prompt }], max_tokens: maxTokens }),
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) throw new Error(`OpenRouterProvider: HTTP ${res.status}`);
    const json = await res.json();
    return json.choices?.[0]?.message?.content ?? '';
  }

  async analyze(input, opts) {
    return this.generate(`Analiza de forma neutral el siguiente contexto estructurado:\n${JSON.stringify(input)}`, opts);
  }

  async summarize(input, opts) {
    return this.generate(`Resume sin agregar recomendaciones nuevas:\n${JSON.stringify(input)}`, opts);
  }
}

// resolveProvider(): DeepSeek primario -> OpenRouter fallback (prompt seccion
// 23). Solo se usaria fuera del pipeline deterministico.
export async function resolveProvider(DeepSeekProviderClass) {
  const deepseek = new DeepSeekProviderClass();
  if (deepseek.isConfigured()) return deepseek;
  const fallback = new OpenRouterProvider();
  if (fallback.isConfigured()) return fallback;
  throw new Error('resolveProvider: ningun proveedor de IA configurado (DEEPSEEK_API_KEY / OPENROUTER_API_KEY)');
}
