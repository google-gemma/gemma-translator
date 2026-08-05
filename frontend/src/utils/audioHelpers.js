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

// Audio utilities for the recorder's Float32 PCM pipeline.

// Concatenate the per-callback Float32Array chunks into one buffer.
export function getMergedSamples(recordedSamples) {
  let totalLength = 0
  for (let i = 0; i < recordedSamples.length; i++) {
    totalLength += recordedSamples[i].length
  }
  const merged = new Float32Array(totalLength)
  let offset = 0
  for (let i = 0; i < recordedSamples.length; i++) {
    merged.set(recordedSamples[i], offset)
    offset += recordedSamples[i].length
  }
  return merged
}

// Naive linear-interpolation resampler — quality is fine for speech STT.
export function resample(audioBuffer, originalSampleRate, targetSampleRate) {
  if (originalSampleRate === targetSampleRate) {
    return audioBuffer
  }
  const ratio = originalSampleRate / targetSampleRate
  const newLength = Math.round(audioBuffer.length / ratio)
  const result = new Float32Array(newLength)
  for (let i = 0; i < newLength; i++) {
    const position = i * ratio
    const index = Math.floor(position)
    const fraction = position - index
    const sampleCurrent = audioBuffer[index]
    const sampleNext =
      index + 1 < audioBuffer.length ? audioBuffer[index + 1] : sampleCurrent
    result[i] = sampleCurrent + fraction * (sampleNext - sampleCurrent)
  }
  return result
}

// Base64-encode a Blob, stripping the "data:...;base64," data-URL prefix.
export function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => resolve(reader.result.split(",")[1])
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}
