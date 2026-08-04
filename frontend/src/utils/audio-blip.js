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

// Tiny synthesized UI sounds (no audio assets) on a shared AudioContext:
// "speaker" = person switch, "ping" = recording start,
// default = language-rotation click.
let audioCtx = null

export function playBlip(type = "language") {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)()
  }
  if (audioCtx.state === "suspended") {
    audioCtx.resume()
  }

  const oscillator = audioCtx.createOscillator()
  const gainNode = audioCtx.createGain()

  oscillator.connect(gainNode)
  gainNode.connect(audioCtx.destination)

  const now = audioCtx.currentTime

  if (type === "speaker") {
    // Quick higher blip
    oscillator.type = "sine"
    oscillator.frequency.setValueAtTime(600, now)
    oscillator.frequency.exponentialRampToValueAtTime(800, now + 0.05)

    gainNode.gain.setValueAtTime(0, now)
    gainNode.gain.linearRampToValueAtTime(0.08, now + 0.01)
    gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.1)

    oscillator.start(now)
    oscillator.stop(now + 0.1)
  } else if (type === "ping") {
    // Clear ping for recording start
    oscillator.type = "sine"
    oscillator.frequency.setValueAtTime(880, now)

    gainNode.gain.setValueAtTime(0, now)
    gainNode.gain.linearRampToValueAtTime(0.1, now + 0.02)
    gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.3)

    oscillator.start(now)
    oscillator.stop(now + 0.3)
  } else {
    // Quick lower/clicking blip for language
    oscillator.type = "sine"
    oscillator.frequency.setValueAtTime(400, now)
    oscillator.frequency.exponentialRampToValueAtTime(200, now + 0.05)

    gainNode.gain.setValueAtTime(0, now)
    gainNode.gain.linearRampToValueAtTime(0.08, now + 0.01)
    gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.1)

    oscillator.start(now)
    oscillator.stop(now + 0.1)
  }
}
