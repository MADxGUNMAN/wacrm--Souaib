import { AiError, type ProviderResult } from '../types'
import { generateOpenAiCompatible } from './openai-compatible'
import { type ProviderArgs } from './shared'

/**
 * Call Cloudflare Workers AI using their OpenAI-compatible endpoint.
 */
export async function generateCloudflare(args: ProviderArgs): Promise<ProviderResult> {
  // Cloudflare requires an Account ID. We expect it in the API Key field as ACCOUNT_ID:API_TOKEN
  const parts = args.apiKey.split(':')
  if (parts.length !== 2) {
    throw new AiError('Cloudflare API Key must be formatted as ACCOUNT_ID:API_TOKEN', { code: 'config_error' })
  }
  const [accountId, token] = parts
  
  const baseUrl = `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/v1/chat/completions`
  
  // Clone args with just the token
  const cfArgs = { ...args, apiKey: token }
  
  return generateOpenAiCompatible('Cloudflare', baseUrl, cfArgs)
}
