// Interfaz AIProvider (prompt del motor operativo, seccion 23). El pipeline
// deterministico (pipeline/orchestrator.js) NO importa nada de este
// archivo: la IA esta desacoplada de la logica productiva (knowledge/decision/
// rules.json.ai_provider_independence). Sirve para explicacion/sintesis
// futura, nunca como fuente primaria de verdad (prompt seccion 24).
//
// Estrategia documentada: DeepSeek (primario) -> OpenRouter (fallback).
// OpenAI/Anthropic quedan evaluados a futuro, sin implementar aqui.
export class AIProvider {
  async generate(_prompt, _opts) {
    throw new Error('AIProvider.generate no implementado');
  }
  async analyze(_input, _opts) {
    throw new Error('AIProvider.analyze no implementado');
  }
  async summarize(_input, _opts) {
    throw new Error('AIProvider.summarize no implementado');
  }
}
