# Enclosure STL Files

This folder contains 3D-printable mesh files for the **Gemma Translator** handheld enclosure — the two-person, face-to-face translation kiosk shown in the [project demo](../README.md).

The prototype is designed as a **portable appliance**: a Raspberry Pi 5 runs the full offline translation stack (STT → Gemma → TTS) behind a small landscape touchscreen, with microphone input and speaker output built into the case.

These are **STL export files only**. Editable CAD source (STEP, Fusion 360, Onshape, etc.) and a full bill of materials are **not** included in this repository at this time.

## Files

| File | Purpose | Approx. bounding box | Mesh complexity | Est. solid volume |
|------|---------|----------------------|-----------------|-------------------|
| `main-body.stl` | Main enclosure shell; houses the Pi, display, and internal components | ~209 × 132 × 41 mm | ~137k triangles | ~64 cm³ |
| `front-face.stl` | Front panel / faceplate | ~83 × 125 × 7 mm | ~8k triangles | ~11 cm³ |
| `speaker-support.stl` | Internal bracket for mounting a speaker | ~62 × 54 × 18 mm | ~19k triangles | ~5 cm³ |

> **Dimensions** are approximate bounding boxes derived from the STL meshes. **Volumes** are rough estimates from mesh geometry and are useful for filament planning, not tolerance-critical fit checks. Always measure your printed parts before sourcing hardware.

### Rough material estimate

Using the estimated mesh volumes above and typical slicer settings:

| Setting | Approx. filament |
|---------|------------------|
| 20% infill, PLA (~1.24 g/cm³) | ~25–30 g total |
| 30% infill, PLA | ~30–35 g total |

Actual usage depends on your slicer, infill pattern, wall count, and whether supports are generated.

## Intended hardware

The software and UI are designed around the hardware listed in the main [README](../README.md#required-hardware):

| Component | Requirement | Notes |
|-----------|-------------|-------|
| **Compute** | Raspberry Pi 5, 8 GB RAM | Required for on-device Gemma inference |
| **Display** | Small landscape touchscreen, e.g. **480×320** | UI is hardcoded to 480×320 px landscape |
| **Audio input** | Microphone or USB audio capture | Used by Moonshine STT |
| **Audio output** | Speaker or headphone output | Used by moonshine-voice TTS |
| **Storage** | ~6 GB free (model + cache) | See `download_model.sh` requirements |

### Display and UI constraints

The web frontend is built specifically for a **480×320 landscape** handheld screen:

- The main app container is fixed at `480px × 320px` in `frontend/style.css`.
- The layout is a **two-lane kiosk**: two people face each other and each use one side of the device.
- The interface is **keyboard-first** in the current build — on-screen touch controls for recording are not enabled. A USB keyboard (or wired handheld keyboard) is expected for push-to-talk and language selection. See [Keyboard Shortcuts](../README.md#keyboard-shortcuts) in the main README.

A display close to 480×320 in landscape orientation will give the best results. Larger screens will work in kiosk mode but the UI will not scale beyond the fixed layout unless modified.

### Audio notes

- The backend supports **PipeWire** (`wpctl`), **PulseAudio** (`pactl`), and **ALSA** (`amixer`) for system volume control on the Pi.
- `deploy-pi.sh` launches Chromium with flags for autoplay and microphone access in kiosk mode.
- USB audio interfaces are a practical option if the built-in Pi audio path is insufficient.

## Suggested assembly workflow

No official assembly guide is published yet. A reasonable build order:

1. **Print all three parts** and dry-fit them together.
2. **Install Raspberry Pi OS** (Bookworm or later) on the Pi 5.
3. **Mount the display** behind `front-face.stl` / inside `main-body.stl`. Confirm the active area aligns with the 480×320 UI.
4. **Mount the speaker** on `speaker-support.stl` and route wiring through the main body.
5. **Connect microphone input** (GPIO/USB) and verify capture with the app.
6. **Install the Pi** inside the main body with adequate airflow around the SoC.
7. **Attach the front face** and secure the enclosure (method depends on your hardware — screws/adhesive not specified in this repo).
8. **Run the software stack** (see below) and test translation end-to-end before closing the case permanently.

Allow clearance for USB power, SD card access, and debugging ports during initial bring-up.

## Software setup

The enclosure is only half the build — the translation appliance also needs the software stack from this repository.

### Quick start (development)

```bash
chmod +x setup.sh download_model.sh start.sh
./setup.sh
./download_model.sh
./start.sh
```

### Production kiosk on Raspberry Pi

For a permanent appliance install with systemd + Chromium kiosk mode:

```bash
./deploy-pi.sh
```

This script installs dependencies, builds the production UI, downloads the LiteRT-LM model, registers a systemd service, and configures LXDE autostart to open `http://localhost:3000` in fullscreen.

See [Raspberry Pi Appliance Deployment](../README.md#raspberry-pi-appliance-deployment) in the main README for details.

## Printing notes

The repository does not ship official print profiles. As a starting point:

| Topic | Suggestion |
|-------|------------|
| **Material** | PLA (easy) or PETG (more durable / heat-resistant) |
| **Infill** | 20–30% for `front-face` and `speaker-support`; consider 25–35% for `main-body` |
| **Walls / perimeters** | 3+ perimeters on `main-body` for stiffness |
| **Supports** | Likely required for overhangs on `main-body.stl`; preview orientations in your slicer |
| **Layer height** | 0.2 mm is a good default; 0.16 mm for cleaner faceplate details |
| **Bed adhesion** | Use a brim on tall/narrow parts if warping is an issue |

### Per-part tips

- **`main-body.stl`** — Largest and most complex part (~6.7 MB mesh). Orient to minimize supports on interior cavities. Allow extra print time.
- **`front-face.stl`** — Thin faceplate (~7 mm thick). Print slowly for clean edges around display openings.
- **`speaker-support.stl`** — Smallest part; good candidate for a test print to verify scale before committing filament to the main body.

These are **community-suggested defaults**, not manufacturer specifications.

## Post-processing and fit-up

- **Dry-fit first** — assemble all printed parts without electronics to check alignment.
- **Sanding** — light sanding on mating surfaces can improve panel fit.
- **Scaling** — if parts are slightly off, adjust slicer flow or XY scale in small increments (±0.5–1%) rather than resizing STLs aggressively.
- **Measure openings** — use calipers on printed display and speaker cutouts before buying hardware.

## What is not included

The following are **not** currently published in this repo:

- Editable CAD source files (Onshape, STEP, Fusion 360, etc.)
- Exact display model / cutout dimensions
- Speaker, microphone, or fastener part numbers
- Screw lengths, standoff heights, or cable routing diagrams
- Step-by-step wiring instructions
- Thermal management specifications

If you are building from these STLs, you will likely need to measure openings and choose compatible off-the-shelf parts. Community documentation (BOMs, assembly photos, remixes) is welcome.

## Troubleshooting

| Problem | Things to check |
|---------|-----------------|
| UI does not fill the screen | Display resolution/orientation; kiosk should be landscape 480×320 |
| No microphone input | USB permissions; HTTPS/mic policy when not on localhost; `deploy-pi.sh` Chromium flags |
| No audio output | Speaker wiring; system volume (`wpctl` / `amixer`); TTS enabled in Settings |
| Model download fails | Disk space (~6 GB required); see `download_model.sh` |
| Parts do not fit | Re-check print scale; measure STLs vs. printed output; verify slicer units are mm |

## Contributing

If you design an improved enclosure, document a BOM, publish assembly notes, or create remixes, contributions are welcome via pull request.

For questions about releasing additional CAD assets, see [issue #8](https://github.com/google-gemma/gemma-translator/issues/8).

## See also

- [Main README](../README.md) — software setup, hardware requirements, keyboard shortcuts
- [Project demo animation](https://storage.googleapis.com/experiments-uploads/gemma-translator/gemma-translator-cad.gif) — enclosure CAD preview from the README
- [Issue #8](https://github.com/google-gemma/gemma-translator/issues/8) — discussion on open-sourcing full CAD files
