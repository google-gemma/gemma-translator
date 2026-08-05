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

import React, { useState, useEffect } from "react"
import TranslatorApp from "./TranslatorApp"
import SettingsOverlay from "./components/SettingsOverlay"
import { testConnectionAPI } from "./utils/api"

// App shell: owns the global config (keyboardMode and themeColor persist in
// localStorage), the settings overlay, and applies the theme by overriding
// the --bg-black CSS variable.
function App() {
  // Global configuration
  const [config, setConfig] = useState({
    endpointUrl: "http://localhost:9379/v1",
    modelName: "gemma4-e2b",
    apiKey: "",
    keyboardMode: localStorage.getItem("keyboardMode") || "landscape",
    useProxy: true,
    enableTts: true,
    visualizerBars: 16,
    systemPrompt: "Translator mode",
    themeColor: localStorage.getItem("themeColor") || "#ffa500",
  })

  const [isSettingsOpen, setIsSettingsOpen] = useState(false)

  const testConnection = async () => {
    try {
      await testConnectionAPI(
        config.endpointUrl,
        config.useProxy,
        config.apiKey,
      )
    } catch (err) {
      // Ignored: API test failure
    }
  }

  useEffect(() => {
    testConnection()
  }, [])

  useEffect(() => {
    localStorage.setItem("keyboardMode", config.keyboardMode)
  }, [config.keyboardMode])

  useEffect(() => {
    if (config.themeColor) {
      document.documentElement.style.setProperty('--bg-black', config.themeColor)
      localStorage.setItem("themeColor", config.themeColor)
    }
  }, [config.themeColor])

  return (
    <div className="app-container">
      <div className="config-wrap-right" style={{ opacity: 1 }}>
        <button
          className="config-toggle-btn"
          onClick={() => setIsSettingsOpen(true)}
          title="Settings"
        >
          ⚙️
        </button>
      </div>

      <div style={{ height: '100%' }}>
        <TranslatorApp config={config} />
      </div>

      <SettingsOverlay
        isActive={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        config={config}
        setConfig={setConfig}
        onTestConnection={testConnection}
      />
    </div>
  )
}

export default App
