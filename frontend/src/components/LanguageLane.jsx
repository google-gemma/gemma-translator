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

import React, { useEffect, useRef } from "react"

// One person's lane: the vertical "revolver" language selector plus the
// recording highlight state. The kiosk is keyboard-first — the ◀▶ arrows stay
// in the DOM for layout but are hidden via CSS (.rotator-arrow).
export default function LanguageLane({
  laneId,
  laneLabel,
  languages,
  currentIndex,
  isRecording,
  isActivePerson,
  onRotate,
}) {
  const drumRef = useRef(null)

  // Slide the drum so the current language row is in the viewport.
  // The 24px row height must match .revolver-item in style.css.
  useEffect(() => {
    if (drumRef.current) {
      drumRef.current.style.transform = `translateY(-${currentIndex * 24}px)`
    }
  }, [currentIndex])

  const handlePrev = (e) => {
    e.preventDefault()
    if (!isRecording) onRotate(-1)
  }

  const handleNext = (e) => {
    e.preventDefault()
    if (!isRecording) onRotate(1)
  }

  return (
    <section
      className={`language-lane lane-${laneId === 1 ? "one" : "two"} ${isRecording ? "recording" : ""} ${isActivePerson ? "selected" : ""}`}
      id={`lane-${laneId}`}
    >
      <div className="lane-header">
        <span className="lane-label">{laneLabel}</span>
      </div>
      <div className="revolver-stage">
        <button
          className="rotator-arrow"
          title="Previous language"
          onClick={handlePrev}
        >
          ◀
        </button>
        <div className="revolver-viewport">
          <div className="revolver-drum" ref={drumRef}>
            {languages.map((l, i) => (
              <div key={l.code} className="revolver-item">
                {l.name.split(" ")[0].toUpperCase()}
              </div>
            ))}
          </div>
        </div>
        <button
          className="rotator-arrow"
          title="Next language"
          onClick={handleNext}
        >
          ▶
        </button>
      </div>
      <span className="language-name" style={{ display: "none" }}>
        {languages[currentIndex].name}
      </span>
      <div className="corner-brackets"></div>
    </section>
  )
}
