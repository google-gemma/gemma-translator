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

import { useState, useRef, useCallback, useEffect } from "react"
import { getMergedSamples, resample, blobToBase64 } from "../utils/audioHelpers"

// Mic capture hook: records raw Float32 PCM via Web Audio, resamples to
// 16 kHz mono, and returns it base64-encoded — the exact payload format
// expected by POST /api/stt (backend/server.py).
// ScriptProcessorNode is deprecated but used deliberately: it needs no
// separately-served AudioWorklet module and is fine for short push-to-talk
// clips on the kiosk's Chromium.
export function useAudioRecorder() {
  const [isRecording, setIsRecording] = useState(false)
  const [micError, setMicError] = useState(null)

  const audioContextRef = useRef(null)
  const analyserRef = useRef(null)
  const sourceRef = useRef(null)
  const scriptProcessorRef = useRef(null)
  const streamRef = useRef(null)
  const recordedSamplesRef = useRef([])

  useEffect(() => {
    return () => {
      if (audioContextRef.current && audioContextRef.current.state !== "closed") {
        audioContextRef.current.close()
      }
    }
  }, [])

  const startRecording = useCallback(async () => {
    setMicError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
      })

      streamRef.current = stream

      const AudioContext = window.AudioContext || window.webkitAudioContext
      audioContextRef.current = new AudioContext()
      if (audioContextRef.current.state === "suspended") {
        await audioContextRef.current.resume()
      }
      const source = audioContextRef.current.createMediaStreamSource(stream)
      sourceRef.current = source

      // Small FFT — the analyser only feeds the low-res bar visualizer.
      analyserRef.current = audioContextRef.current.createAnalyser()
      analyserRef.current.fftSize = 256
      source.connect(analyserRef.current)

      const scriptProcessor = audioContextRef.current.createScriptProcessor(4096, 1, 1)
      scriptProcessorRef.current = scriptProcessor
      recordedSamplesRef.current = []

      scriptProcessor.onaudioprocess = (e) => {
        const inputData = e.inputBuffer.getChannelData(0)
        recordedSamplesRef.current.push(new Float32Array(inputData))
      }

      source.connect(scriptProcessor)
      scriptProcessor.connect(audioContextRef.current.destination)

      setIsRecording(true)
      return true
    } catch (err) {
      console.error("Error accessing microphone:", err)
      const msg = err.message || "Microphone access failed (HTTPS required for remote devices)"
      setMicError(msg)
      return false
    }
  }, [])

  const stopRecording = useCallback(async () => {
    if (!isRecording) return

    setIsRecording(false)
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop())
    }

    if (scriptProcessorRef.current) {
      scriptProcessorRef.current.disconnect()
      scriptProcessorRef.current.onaudioprocess = null
      scriptProcessorRef.current = null
    }
    if (sourceRef.current) {
      sourceRef.current.disconnect()
      sourceRef.current = null
    }
    if (analyserRef.current) {
      analyserRef.current.disconnect()
    }

    const actualSampleRate = audioContextRef.current?.sampleRate || 16000
    if (audioContextRef.current && audioContextRef.current.state !== "closed") {
      await audioContextRef.current.close()
    }

    if (recordedSamplesRef.current.length === 0) {
      console.warn("No audio samples recorded")
      return null
    }

    const mergedSamples = getMergedSamples(recordedSamplesRef.current)
    recordedSamplesRef.current = []
    const targetSampleRate = 16000 // Moonshine STT expects 16 kHz mono
    const resampledSamples = resample(
      mergedSamples,
      actualSampleRate,
      targetSampleRate,
    )
    const rawBlob = new Blob([resampledSamples.buffer], {
      type: "application/octet-stream",
    })

    try {
      const base64Data = await blobToBase64(rawBlob)
      return { rawBlob, base64Data }
    } catch (err) {
      console.error("Base64 encoding failed:", err)
      return null
    }
  }, [isRecording])

  return {
    isRecording,
    startRecording,
    stopRecording,
    analyser: analyserRef.current,
    micError,
    setMicError,
  }
}
