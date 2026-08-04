/**
 * Copyright 2026 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

// API client for the Python backend (backend/server.py). LLM calls are
// routed through the backend's /proxy by default so the kiosk stays
// same-origin (no CORS) and works fully offline.

// Normalize a user-entered endpoint into an OpenAI-compatible ".../v1" base.
export function getNormalizedBaseUrl(endpointUrl) {
  let url = endpointUrl.trim()
  if (!url) return "http://localhost:9379/v1"
  url = url.replace(/\/+$/, "")
  if (!url.endsWith("/v1")) {
    url += "/v1"
  }
  return url
}

// Cheap connectivity probe: GET {base}/v1/models.
export async function testConnectionAPI(endpointUrl, useProxy, apiKey) {
  const baseUrl = getNormalizedBaseUrl(endpointUrl)
  const targetUrl = `${baseUrl}/models`

  const headers = {}
  if (apiKey && apiKey.trim() !== "") {
    headers["Authorization"] = `Bearer ${apiKey.trim()}`
  }

  const fetchUrl = useProxy
    ? `/proxy?url=${encodeURIComponent(targetUrl)}`
    : targetUrl

  const response = await fetch(fetchUrl, { method: "GET", headers })
  if (!response.ok) {
    throw new Error(`API error: ${response.status}`)
  }
  return true
}

// POST base64 Float32 PCM (16 kHz mono) to the local Moonshine STT.
export async function transcribeAudio(base64Data, sourceLangCode) {
  const response = await fetch("/api/stt", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      audio_base64: base64Data,
      language: sourceLangCode,
    }),
  })

  if (!response.ok) {
    throw new Error(`STT failed: ${response.status}`)
  }

  const sttData = await response.json()
  return sttData.text || ""
}

function generatePayloadJSON(transcribedText, model, systemPrompt) {
  const messages = []
  if (systemPrompt && systemPrompt.trim()) {
    messages.push({ role: "system", content: systemPrompt.trim() })
  }
  messages.push({
    role: "user",
    content: transcribedText,
  })

  return JSON.stringify({ model: model || "gemma4-e2b", messages })
}

// Chat-completions request. The system prompt demands a bare
// {"translation": ...} JSON object; we still tolerate ``` fences and fall
// back to the raw reply text if parsing fails.
export async function translateText(transcribedText, config) {
  const { endpointUrl, useProxy, apiKey, modelName, systemPrompt } = config
  const baseUrl = getNormalizedBaseUrl(endpointUrl)
  const targetUrl = `${baseUrl}/chat/completions`
  const payload = generatePayloadJSON(transcribedText, modelName, systemPrompt)

  const headers = { "Content-Type": "application/json" }
  if (apiKey && apiKey.trim() !== "") {
    headers["Authorization"] = `Bearer ${apiKey.trim()}`
  }

  const fetchUrl = useProxy
    ? `/proxy?url=${encodeURIComponent(targetUrl)}`
    : targetUrl
  const startRequestTime = Date.now()

  const response = await fetch(fetchUrl, {
    method: "POST",
    headers,
    body: payload,
  })
  const requestDuration = ((Date.now() - startRequestTime) / 1000).toFixed(2)

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(
      `API ${response.status}: ${errorText || response.statusText}`,
    )
  }

  const data = await response.json()
  let modelResponse = ""
  if (data.choices && data.choices[0] && data.choices[0].message) {
    modelResponse = data.choices[0].message.content || ""
  } else {
    modelResponse = JSON.stringify(data, null, 2)
  }

  let translationVal = ""
  try {
    let cleanJson = modelResponse.trim()
    if (cleanJson.startsWith("```json")) {
      cleanJson = cleanJson.slice(7)
    }
    if (cleanJson.startsWith("```")) {
      cleanJson = cleanJson.slice(3)
    }
    if (cleanJson.endsWith("```")) {
      cleanJson = cleanJson.slice(0, -3)
    }
    cleanJson = cleanJson.trim()

    const parsed = JSON.parse(cleanJson)
    translationVal = parsed.translation || ""
  } catch (e) {
    translationVal = modelResponse
  }

  return {
    translation: translationVal,
    duration: requestDuration,
    tokens: data.usage?.total_tokens || 0,
  }
}

// Word-safe chunking so each /api/tts request stays under ~`limit` chars.
export function splitTextIntoSpeechChunks(text, limit = 180) {
  const words = text.split(/\s+/)
  const chunks = []
  let currentChunk = ""
  for (const word of words) {
    if ((currentChunk + " " + word).trim().length <= limit) {
      currentChunk = (currentChunk + " " + word).trim()
    } else {
      if (currentChunk) chunks.push(currentChunk)
      currentChunk = word
    }
  }
  if (currentChunk) chunks.push(currentChunk)
  return chunks
}

