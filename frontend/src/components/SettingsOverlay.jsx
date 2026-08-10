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

import React from "react"

// Fullscreen developer settings: theme color, LLM endpoint/model/key,
// keyboard mode, TTS toggle, visualizer density, and system volume
// (proxied to amixer on the Pi via the backend's /api/volume).
export default function SettingsOverlay({
  isActive,
  onClose,
  config,
  setConfig,
  onTestConnection,
}) {
  const THEME_COLORS = [
    { name: "RED", value: "#ff4444" },
    { name: "WHITE", value: "#ffffff" },
    { name: "YELLOW", value: "#ffeb3b" },
    { name: "BLUE", value: "#2196f3" },
    { name: "GREEN", value: "#4caf50" },
    { name: "ORANGE", value: "#ffa500" },
  ];

  const [systemVolume, setSystemVolume] = React.useState(null);

  React.useEffect(() => {
    if (isActive) {
      fetch('/api/volume')
        .then((res) => res.json())
        .then((data) => {
          if (data.volume !== undefined && data.volume !== null) {
            setSystemVolume(data.volume);
          }
        })
        .catch((e) => console.error("Failed to fetch volume", e));
    }
  }, [isActive]);

  if (!isActive) return null

  const handleChange = (key, value) => {
    setConfig((prev) => ({ ...prev, [key]: value }))
  }

  const handleVolumeChange = async (action) => {
    try {
      const res = await fetch('/api/volume', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action })
      });
      const data = await res.json();
      if (data.volume !== undefined && data.volume !== null) {
        setSystemVolume(data.volume);
      }
    } catch (e) {
      console.error('Failed to change volume:', e);
    }
  }

  return (
    <div
      className={`settings-overlay ${isActive ? "active" : ""}`}
      style={{ display: isActive ? "flex" : "none" }}
    >
      <header className="overlay-header">
        <h2>Developer Settings</h2>
        <button className="overlay-close-btn" onClick={onClose}>
          ✕
        </button>
      </header>
      <div className="overlay-body">
        <div className="form-group" style={{ marginBottom: "10px" }}>
          <label>System Volume</label>
          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            <button
              className="overlay-btn"
              style={{ flex: 1 }}
              onClick={() => handleVolumeChange('down')}
            >
              -
            </button>
            <span style={{ minWidth: "40px", textAlign: "center", fontWeight: "bold" }}>
              {systemVolume !== null ? `${systemVolume}%` : "--"}
            </span>
            <button
              className="overlay-btn"
              style={{ flex: 1 }}
              onClick={() => handleVolumeChange('up')}
            >
              +
            </button>
          </div>
        </div>

        <div className="form-group">
          <label>Theme Color</label>
          <div style={{ display: 'flex', gap: '10px', marginTop: '5px' }}>
            {THEME_COLORS.map((c) => (
              <button
                key={c.name}
                onClick={() => handleChange("themeColor", c.value)}
                title={c.name}
                style={{
                  width: '30px',
                  height: '30px',
                  borderRadius: '50%',
                  backgroundColor: c.value,
                  border: config.themeColor === c.value ? '2px solid #000' : '2px solid transparent',
                  boxShadow: config.themeColor === c.value ? '0 0 0 2px #fff' : 'none',
                  cursor: 'pointer',
                  padding: 0
                }}
              />
            ))}
          </div>
        </div>

        <div className="form-group">
          <label>API Endpoint</label>
          <div className="input-inline">
            <input
              type="text"
              value={config.endpointUrl}
              onChange={(e) => handleChange("endpointUrl", e.target.value)}
            />
            <button className="overlay-btn btn-sm" onClick={onTestConnection}>
              Test
            </button>
          </div>
        </div>

        <div className="form-group">
          <label>Model Name</label>
          <input
            type="text"
            value={config.modelName}
            onChange={(e) => handleChange("modelName", e.target.value)}
            list="model-suggestions"
          />
          <datalist id="model-suggestions">
            <option value="gemma4-e2b"></option>
            <option value="gemma-4-2b"></option>
          </datalist>
        </div>

        <div className="form-group">
          <label>API Key</label>
          <input
            type="password"
            placeholder="Optional API key"
            value={config.apiKey}
            onChange={(e) => handleChange("apiKey", e.target.value)}
          />
        </div>

        <div className="form-group">
          <label>Keyboard Mode</label>
          <select
            value={config.keyboardMode}
            onChange={(e) => handleChange("keyboardMode", e.target.value)}
          >
            <option value="landscape">
              Landscape — active person (Space / Z / ← →)
            </option>
            <option value="vertical">
              Vertical — two-hand (Z / X / ← → / − +)
            </option>
          </select>
        </div>

        <div className="form-row-checkboxes">
          <label className="checkbox-container">
            <input
              type="checkbox"
              checked={config.enableTts}
              onChange={(e) => handleChange("enableTts", e.target.checked)}
            />
            <span className="checkbox-label">Enable Speech Output</span>
          </label>
        </div>

        <div className="form-group">
          <label>Visualizer</label>
          <div className="slider-row">
            <div className="slider-group">
              <label>
                Bars: <span>{config.visualizerBars}</span>
              </label>
              <input
                type="range"
                min="8"
                max="128"
                step="8"
                value={config.visualizerBars}
                onChange={(e) => handleChange("visualizerBars", e.target.value)}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
