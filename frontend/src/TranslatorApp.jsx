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

import React, { useState, useEffect, useRef, useCallback } from "react"
import LanguageLane from "./components/LanguageLane"
import ResponseDrawer from "./components/ResponseDrawer"
import Visualizer from "./components/Visualizer"
import { useAudioRecorder } from "./hooks/useAudioRecorder"
import {
  transcribeAudio,
  translateText,
  splitTextIntoSpeechChunks,
} from "./utils/api"
import { playBlip } from "./utils/audio-blip"

// Core orchestrator for the two-person kiosk translator.
// Flow: hold a key → record mic (useAudioRecorder) → POST /api/stt (Moonshine)
// → LLM translation via /proxy (Gemma, strict-JSON prompt) → /api/tts playback.

// Languages offered on each lane's revolver; ttsLang selects the backend voice.
const AVAILABLE_LANGUAGES = [
  { code: "ar", name: "Arabic", voice: "tts", ttsLang: "ar" },
  { code: "en", name: "English", voice: "tts", ttsLang: "en" },
  { code: "es", name: "Spanish", voice: "tts", ttsLang: "es" },
  { code: "ja", name: "Japanese", voice: "tts", ttsLang: "ja" },
  { code: "zh", name: "Chinese", voice: "tts", ttsLang: "zh" },
  { code: "ko", name: "Korean", voice: "tts", ttsLang: "ko" },
]

function TranslatorApp({ config }) {
  // UI State
  const [isDrawerOpen, setIsDrawerOpen] = useState(false)
  const [activePerson, setActivePerson] = useState(1)

  // Translation State
  const [transcriptionData, setTranscriptionData] = useState({
    source: "",
    text: "— listening —",
  })
  const [translationData, setTranslationData] = useState({
    target: "",
    text: "— waiting —",
  })
  const [metaText, setMetaText] = useState("")

  // Currently-playing TTS audio element (chunked playback chain)
  const onlineAudioPlayerRef = useRef(null)

  // Language Lanes State
  const [lang1Index, setLang1Index] = useState(0)
  const [lang2Index, setLang2Index] = useState(1)
  const [activeLaneRecording, setActiveLaneRecording] = useState(null) // 1 or 2

  const { isRecording, startRecording, stopRecording, analyser, micError } =
    useAudioRecorder()

  useEffect(() => {
    if (micError) {
      setIsDrawerOpen(true)
      setTranscriptionData({ source: "Microphone", text: "Access Failed" })
      setTranslationData({
        target: "Error",
        text: `${micError} (HTTPS is required when accessing from remote devices)`,
      })
    }
  }, [micError])

  const stopSpeaking = useCallback(() => {
    if (onlineAudioPlayerRef.current) {
      onlineAudioPlayerRef.current.pause()
      onlineAudioPlayerRef.current = null
    }
  }, [])

  // Speak text via /api/tts, splitting into ~180-char chunks and chaining
  // playback so long translations don't overflow a single TTS request.
  const playTTS = useCallback(
    (text, targetLang) => {
      if (!text) return
      stopSpeaking()

      const chunks = splitTextIntoSpeechChunks(text)
      if (chunks.length === 0) return

      let chunkIndex = 0

      const playNextChunk = () => {
        if (chunkIndex >= chunks.length) {
          stopSpeaking()
          return
        }
        const ttsUrl = `/api/tts?text=${encodeURIComponent(chunks[chunkIndex])}&lang=${encodeURIComponent(targetLang)}`
        const player = new Audio(ttsUrl)
        player.volume = 1.0
        onlineAudioPlayerRef.current = player

        player.onended = () => {
          chunkIndex++
          playNextChunk()
        }
        player.onerror = () => {
          stopSpeaking()
          alert("TTS playback failed. Backend server may be offline.")
        }
        player.play().catch((e) => {
          console.error("Audio play error:", e)
          stopSpeaking()
        })
      }

      playNextChunk()
    },
    [stopSpeaking],
  )

  // Rotate a lane's language, skipping the slot held by the other lane
  // (the two lanes may never show the same language).
  const handleRotateLanguage = useCallback(
    (lane, direction) => {
      if (isRecording) return
      const N = AVAILABLE_LANGUAGES.length

      playBlip("language")

      if (lane === 1) {
        let ni = (lang1Index + direction + N) % N
        if (ni === lang2Index) ni = (ni + direction + N) % N
        setLang1Index(ni)
      } else {
        let ni = (lang2Index + direction + N) % N
        if (ni === lang1Index) ni = (ni + direction + N) % N
        setLang2Index(ni)
      }
    },
    [lang1Index, lang2Index, isRecording],
  )

  // Recording triggers
  const handleRecordStart = useCallback(
    async (lane) => {
      if (isRecording) return
      stopSpeaking()

      setActivePerson((prev) => {
        if (prev !== lane) playBlip("speaker")
        return lane
      })
      setActiveLaneRecording(lane)
      playBlip("ping")

      const ok = await startRecording()
      if (!ok) {
        setActiveLaneRecording(null)
      }
    },
    [isRecording, stopSpeaking, startRecording],
  )

  const handleRecordStop = useCallback(async () => {
    if (!isRecording) return

    const recordedLane = activeLaneRecording
    setActiveLaneRecording(null)
    const audioData = await stopRecording()

    if (audioData) {
      processTranslation(recordedLane, audioData.base64Data)
    }
  }, [isRecording, activeLaneRecording, stopRecording])

  // Translation Pipeline
  const processTranslation = async (lane, base64Data) => {
    setIsDrawerOpen(true)

    const src =
      lane === 1
        ? AVAILABLE_LANGUAGES[lang1Index]
        : AVAILABLE_LANGUAGES[lang2Index]
    const dst =
      lane === 1
        ? AVAILABLE_LANGUAGES[lang2Index]
        : AVAILABLE_LANGUAGES[lang1Index]

    setTranscriptionData({
      source: `${src.name} (Source)`,
      text: "Analyzing voice input...",
    })
    setTranslationData({
      target: `${dst.name} (Translation)`,
      text: "Translating...",
    })
    setMetaText("")

    try {
      // 1. Transcription
      setTranscriptionData((prev) => ({ ...prev, text: "Listening..." }))
      const transcribedText = await transcribeAudio(base64Data, src.code)
      setTranscriptionData((prev) => ({ ...prev, text: transcribedText }))

      if (!transcribedText.trim()) {
        setTranslationData((prev) => ({
          ...prev,
          text: "(No speech detected)",
        }))
        return
      }

      // 2. Translation
      const result = await translateText(transcribedText, {
        ...config,
        modelName: config.modelName,
        systemPrompt: `You are a high-performance translator. Your task is to translate text from ${src.name.split(" ")[0]} into ${dst.name.split(" ")[0]}.\nYou MUST format your response as a valid JSON object matching this structure:\n{\n  "translation": "High-quality, natural translation into ${dst.name.split(" ")[0]}"\n}\nDo NOT return anything else except this JSON object. No Markdown block wraps (no \`\`\`json), no introductory text, no conversational text. Start directly with "{" and end directly with "}".`,
      })

      setTranslationData((prev) => ({ ...prev, text: result.translation }))
      setMetaText(`Duration: ${result.duration}s | Tokens: ${result.tokens}`)

      if (config.enableTts) {
        playTTS(result.translation, dst.ttsLang)
      }
    } catch (err) {
      console.error(err)
      setTranscriptionData((prev) => ({
        ...prev,
        text: prev.text === "Listening..." ? "(Transcription failed)" : prev.text,
      }))
      setTranslationData((prev) => ({ ...prev, text: `Error: ${err.message}` }))
    }
  }

  // Push-to-talk keyboard control (two modes, see README):
  // landscape = one "active person" driven by Space/Z/arrows;
  // vertical   = independent per-lane keys (Z/X for record, arrows and -/+).
  // keydown starts recording, keyup stops — e.repeat guards auto-repeat.
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (["INPUT", "TEXTAREA", "SELECT"].includes(e.target.tagName)) return
      const key = e.key.toLowerCase()

      if (config.keyboardMode === "landscape") {
        if (key === " " || e.key === "Spacebar") {
          e.preventDefault()
          if (!isRecording) {
            playBlip("speaker")
            setActivePerson((p) => (p === 1 ? 2 : 1))
          }
        } else if (key === "z") {
          e.preventDefault()
          if (!e.repeat && !isRecording) handleRecordStart(activePerson)
        } else if (e.key === "ArrowLeft") {
          e.preventDefault()
          handleRotateLanguage(activePerson, -1)
        } else if (e.key === "ArrowRight") {
          e.preventDefault()
          handleRotateLanguage(activePerson, 1)
        }
      } else {
        if (key === "z") {
          e.preventDefault()
          if (!e.repeat && !isRecording) handleRecordStart(1)
        } else if (key === "x") {
          e.preventDefault()
          if (!e.repeat && !isRecording) handleRecordStart(2)
        } else if (e.key === "ArrowLeft") {
          e.preventDefault()
          handleRotateLanguage(1, -1)
        } else if (e.key === "ArrowRight") {
          e.preventDefault()
          handleRotateLanguage(1, 1)
        } else if (key === "-" || key === "_") {
          e.preventDefault()
          handleRotateLanguage(2, -1)
        } else if (key === "+" || key === "=") {
          e.preventDefault()
          handleRotateLanguage(2, 1)
        }
      }
    }

    const handleKeyUp = (e) => {
      if (["INPUT", "TEXTAREA", "SELECT"].includes(e.target.tagName)) return
      const key = e.key.toLowerCase()

      if (config.keyboardMode === "landscape") {
        if (key === "z" && isRecording) handleRecordStop()
      } else {
        if (key === "z" && activeLaneRecording === 1) handleRecordStop()
        if (key === "x" && activeLaneRecording === 2) handleRecordStop()
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    window.addEventListener("keyup", handleKeyUp)
    return () => {
      window.removeEventListener("keydown", handleKeyDown)
      window.removeEventListener("keyup", handleKeyUp)
    }
  }, [
    config.keyboardMode,
    isRecording,
    activePerson,
    activeLaneRecording,
    handleRecordStart,
    handleRecordStop,
    handleRotateLanguage,
  ])

  return (
    <div className="translator-envelope">
      <ResponseDrawer
        isActive={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        transcriptionSource={transcriptionData.source}
        transcriptionText={transcriptionData.text}
        translationTarget={translationData.target}
        translationText={translationData.text}
        metaText={metaText}
      />

      <main className="translator-workspace">
        <div className="languages-container">
          <LanguageLane
            laneId={1}
            laneLabel="1"
            languages={AVAILABLE_LANGUAGES}
            currentIndex={lang1Index}
            isRecording={activeLaneRecording === 1}
            isActivePerson={
              config.keyboardMode === "landscape" && activePerson === 1
            }
            onRotate={(dir) => handleRotateLanguage(1, dir)}
          />
          <LanguageLane
            laneId={2}
            laneLabel="2"
            languages={AVAILABLE_LANGUAGES}
            currentIndex={lang2Index}
            isRecording={activeLaneRecording === 2}
            isActivePerson={
              config.keyboardMode === "landscape" && activePerson === 2
            }
            onRotate={(dir) => handleRotateLanguage(2, dir)}
          />
        </div>

        <Visualizer
          activePerson={activePerson}
          isRecording={isRecording}
          analyser={analyser}
          barsCount={parseInt(config.visualizerBars, 10)}
        />
      </main>
    </div>
  )
}

export default TranslatorApp
