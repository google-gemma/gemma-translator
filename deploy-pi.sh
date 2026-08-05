#!/bin/bash
# Copyright 2026 Google LLC
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

# Automated Raspberry Pi One-Command Appliance Bootstrap Script

set -e

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CURRENT_USER="$(whoami)"
CURRENT_UID="$(id -u)"

echo "==========================================================="
echo "Gemma Offline Translator — Pi Automated Deployment"
echo "Project Dir: ${PROJECT_DIR}"
echo "User: ${CURRENT_USER} (UID: ${CURRENT_UID})"
echo "==========================================================="

if [ "$(uname -s)" != "Linux" ]; then
    echo "[WARNING] This script is intended for Raspberry Pi OS / Debian Linux."
    echo "[WARNING] Current OS: $(uname -s)."
fi

echo "[1/7] Installing OS dependencies..."
if command -v apt-get &> /dev/null; then
    sudo apt-get update
    sudo apt-get install -y python3-venv python3-pip ffmpeg libasound2-dev pulseaudio-utils alsa-utils
else
    echo "[INFO] apt-get not detected. Skipping Debian package installation."
fi

# Node.js/npm preflight — the frontend build (step 3) requires Node 18+ (Vite 5).
# Debian/Raspberry Pi OS Bookworm ships Node 18 via apt, which satisfies this.
if ! command -v npm &> /dev/null; then
    if command -v apt-get &> /dev/null; then
        echo "[INFO] Node.js/npm not found. Installing via apt..."
        sudo apt-get install -y nodejs npm
    else
        echo "[ERROR] npm is required but not installed, and apt-get is unavailable."
        echo "[ERROR] Install Node.js 18+ (https://nodejs.org/) and re-run this script."
        exit 1
    fi
fi
NODE_MAJOR="$(node -v 2>/dev/null | sed 's/^v//' | cut -d. -f1)"
if [ -n "$NODE_MAJOR" ] && [ "$NODE_MAJOR" -lt 18 ] 2>/dev/null; then
    echo "[WARNING] Node.js v${NODE_MAJOR} detected, but v18+ is required by the frontend build."
    echo "[WARNING] Step 3 (npm build) may fail. Please upgrade Node.js first."
fi

echo "[2/7] Running backend environment setup..."
"${PROJECT_DIR}/setup.sh"

echo "[3/7] Installing frontend dependencies & building production UI..."
npm --prefix "${PROJECT_DIR}/frontend" install
npm --prefix "${PROJECT_DIR}/frontend" run build

echo "[4/7] Downloading LiteRT model..."
"${PROJECT_DIR}/download_model.sh"

echo "[5/7] Registering systemd service..."
SERVICE_FILE="/etc/systemd/system/gemma-translator.service"
TEMPLATE_FILE="${PROJECT_DIR}/deploy/gemma-translator.service"

if [ -f "$TEMPLATE_FILE" ]; then
    sed -e "s|{{USER}}|${CURRENT_USER}|g" \
        -e "s|{{PROJECT_DIR}}|${PROJECT_DIR}|g" \
        -e "s|{{UID}}|${CURRENT_UID}|g" \
        "$TEMPLATE_FILE" | sudo tee "$SERVICE_FILE" > /dev/null
    sudo chmod 644 "$SERVICE_FILE"

    sudo systemctl daemon-reload
    sudo systemctl enable gemma-translator.service
    sudo systemctl restart gemma-translator.service

    echo "[6/7] Configuring GUI kiosk autostart..."
    LXSESSION_DIR="/home/${CURRENT_USER}/.config/lxsession/rpd-x"
    AUTOSTART_FILE="${LXSESSION_DIR}/autostart"
    if [ -d "$LXSESSION_DIR" ] || [ -f "/etc/xdg/lxsession/rpd-x/autostart" ]; then
        mkdir -p "$LXSESSION_DIR"
        if [ -f "/etc/xdg/lxsession/rpd-x/autostart" ] && [ ! -f "$AUTOSTART_FILE" ]; then
            cp /etc/xdg/lxsession/rpd-x/autostart "$AUTOSTART_FILE"
        fi
        sed -i '/@chromium/d' "$AUTOSTART_FILE" 2>/dev/null || true
        echo '@chromium --password-store=basic --kiosk --noerrdialogs --disable-infobars --disable-session-crashed-bubble --disable-features=TranslateUI --check-for-update-interval=31536000 --remote-debugging-port=9222 --remote-allow-origins=* --ozone-platform=x11 --use-fake-ui-for-media-stream --autoplay-policy=no-user-gesture-required --allow-insecure-localhost http://localhost:3000' >> "$AUTOSTART_FILE"
        echo "[INFO] Kiosk autostart configured in ${AUTOSTART_FILE} -> http://localhost:3000"
    else
        echo "[INFO] LXDE rpd-x session not detected. Skipping LXDE autostart config."
    fi

    echo "[7/7] Systemd service configured and started."
    systemctl status --no-pager gemma-translator.service || true
else
    echo "[ERROR] Template file ${TEMPLATE_FILE} not found."
    exit 1
fi

echo "==========================================================="
echo "Deployment complete! Appliance running at http://localhost:3000"
echo "==========================================================="
