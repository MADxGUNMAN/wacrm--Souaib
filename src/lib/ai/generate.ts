import {
  AiError,
  type AiConfig,
  type AiUsage,
  type ChatMessage,
  type GenerateResult,
} from './types'
import { HANDOFF_SENTINEL, aiRequestTimeoutMs } from './defaults'
import { generateOpenAi } from './providers/openai'
import { generateAnthropic } from './providers/anthropic'
import { generateGemini } from './providers/gemini'
import { generateCloudflare } from './providers/cloudflare'
import { generateOpenAiCompatible } from './providers/openai-compatible'

export interface GenerateArgs {
  config: AiConfig
  /** Fully-built system prompt (see `buildSystemPrompt`). */
  systemPrompt: string
  /** Recent conversation turns, oldest first. */
  messages: ChatMessage[]
}

/**
 * Generate the next reply from the account's configured provider.
 * Dispatches to the right adapter, then parses the handoff sentinel out
 * of the raw text. Throws `AiError` on any provider/network failure.
 */
export async function generateReply(args: GenerateArgs): Promise<GenerateResult> {
  const { config, systemPrompt, messages } = args
  const timeoutMs = aiRequestTimeoutMs()
  const providerArgs = {
    apiKey: config.apiKey,
    model: config.model,
    systemPrompt,
    messages,
    timeoutMs,
  }

  let result: { text: string; usage: AiUsage | null }
  switch (config.provider) {
    case 'openai':
      result = await generateOpenAi(providerArgs)
      break
    case 'anthropic':
      result = await generateAnthropic(providerArgs)
      break
    case 'gemini':
      result = await generateGemini(providerArgs)
      break
    case 'cloudflare':
      result = await generateCloudflare(providerArgs)
      break
    case 'nvidia':
      result = await generateOpenAiCompatible('NVIDIA NIM', 'https://integrate.api.nvidia.com/v1/chat/completions', providerArgs)
      break
    case 'openrouter':
      result = await generateOpenAiCompatible('OpenRouter', 'https://openrouter.ai/api/v1/chat/completions', providerArgs, {
        'HTTP-Referer': 'https://github.com/ArnasDon/wacrm',
        'X-Title': 'WhatsApp CRM',
      })
      break
    case 'groq':
      result = await generateOpenAiCompatible('Groq', 'https://api.groq.com/openai/v1/chat/completions', providerArgs)
      break
    case 'xai':
      result = await generateOpenAiCompatible('xAI', 'https://api.x.ai/v1/chat/completions', providerArgs)
      break
    default:
      throw new AiError(`Unsupported AI provider: ${config.provider}`, {
        code: 'unsupported_provider',
        status: 400,
      })
  }

  return parseGeneration(result.text, result.usage)
}

/**
 * Split the raw model output into `{ text, handoff, usage }`. The
 * sentinel can appear alone or trailing a partial reply; either way we
 * treat the turn as a handoff and strip the marker from any remaining
 * text. `usage` is passed straight through (null when the provider
 * didn't report it).
 */
export function parseGeneration(
  raw: string,
  usage: AiUsage | null = null,
): GenerateResult {
  const handoff = raw.includes(HANDOFF_SENTINEL)
  let text = ''
  let vars: Record<string, string> | undefined = undefined

  if (handoff) {
    const parts = raw.split(HANDOFF_SENTINEL)
    text = parts[0].trim()
    const remainder = parts.slice(1).join(HANDOFF_SENTINEL).trim()
    if (remainder) {
      try {
        const jsonMatch = remainder.match(/\{[\s\S]*\}/)
        if (jsonMatch) {
          vars = JSON.parse(jsonMatch[0])
        }
      } catch (e) {
        // Ignore parse errors if the AI output malformed JSON
      }
    }
  } else {
    text = raw.trim()
  }

  return { text, handoff, usage, vars }
}
