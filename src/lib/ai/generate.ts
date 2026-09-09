import {
  AiError,
  type AiConfig,
  type AiUsage,
  type ChatMessage,
  type GenerateResult,
} from './types'
import {
  HANDOFF_SENTINEL,
  MAX_OUTPUT_TOKENS,
  aiRequestTimeoutMs,
} from './defaults'
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
  /**
   * Output cap. Defaults to `MAX_OUTPUT_TOKENS` (1024), which is sized
   * for a WhatsApp reply. Callers that need a structured document — the
   * flow-authoring agent — must raise it, or the answer is truncated
   * mid-token and arrives as unparseable text.
   */
  maxOutputTokens?: number
  /** Overrides the 30s default. A large generation needs longer. */
  timeoutMs?: number
}

/**
 * Raw provider call: dispatches to the right adapter and returns its
 * text untouched.
 *
 * Split out from `generateReply` because `parseGeneration` is not
 * safe for structured output — it scans the whole answer for the
 * literal `[[HANDOFF]]` and truncates there. Harmless for chat replies,
 * silently destructive for a JSON document that happens to mention the
 * marker (a flow's own AI-agent system prompt legitimately can).
 *
 * Throws `AiError` on any provider/network failure.
 */
export async function generateRawText(
  args: GenerateArgs
): Promise<{ text: string; usage: AiUsage | null }> {
  const { config, systemPrompt, messages } = args
  const providerArgs = {
    apiKey: config.apiKey,
    model: config.model,
    systemPrompt,
    messages,
    timeoutMs: args.timeoutMs ?? aiRequestTimeoutMs(),
    maxOutputTokens: args.maxOutputTokens ?? MAX_OUTPUT_TOKENS,
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

  return result
}

/**
 * Generate the next reply from the account's configured provider, then
 * parse the handoff sentinel out of the raw text. Throws `AiError` on
 * any provider/network failure.
 */
export async function generateReply(args: GenerateArgs): Promise<GenerateResult> {
  const result = await generateRawText(args)
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
