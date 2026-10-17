# 🤟 SignHero 

**A real-time American Sign Language (ASL) learning platform combining rhythm-based gaming with AI-powered hand sign recognition.**

<p align="center">
  <img src="signhero.png" alt="SignHero" width="600"/>
</p>

---

## 🌟 Overview

SignHero is a full-stack application that teaches ASL fingerspelling through interactive gameplay. The system uses a webcam to detect hand signs in real-time via a trained machine learning model, then challenges players to sign along to beatmaps synced with music—like Guitar Hero, but with sign language.

| Component | Description |
|-----------|-------------|
| **Frontend Game** (`asl/`) | Next.js 15 web app with rhythm game modes, visual effects, and real-time scoring |
| **ML Backend** (`Base test/`) | PyTorch model (MobileNetV2) trained on ASL alphabet data |
| **API Server** (`api_server_http.py`) | FastAPI server for real-time sign prediction via webcam frames |

---

## 🎮 Features

### Game Modes

- **Song Game** — Rhythm-based gameplay with scrolling note highway and combo scoring
- **Training Mode** — Step-by-step practice with visual hand pose hints
- **Testing Mode** — Timed challenges with accuracy tracking
- **Whack-A-Sign** — Arcade-style reflex game

### AI Sign Detection

- Real-time webcam analysis using MediaPipe hand tracking
- MobileNetV2 CNN for letter classification (A-Z)
- ~30-50ms inference latency on localhost

### Visual & Audio

- Synthwave aesthetic with neon effects
- Particle bursts, screen flash, streak glow
- Sound effects for hits/misses

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    User's Browser                       │
│  ┌─────────────────────────────────────────────────────┐│
│  │ Next.js Game (asl/)                                 ││
│  │  • MediaPipe JS (Local WebGL Landmark Extraction)   ││
│  │  • One-in-Flight WebSocket Streaming Backpressure   ││
│  └────────────────────────┬────────────────────────────┘│
└───────────────────────────┼─────────────────────────────┘
                            │ Persistent WebSocket /ws/predict
                            │ (JSON Coordinates ~250 bytes @ 30 FPS)
┌───────────────────────────▼─────────────────────────────┐
│        FastAPI Server (api_server_http.py)              │
│  ┌────────────────────────────────────────────────────┐ │
│  │ RTX 5090 Dynamic Micro-Batcher                     │ │
│  │  1. In-Memory Holding Queue (asyncio.Queue)        │ │
│  │  2. 10ms Sweep (Scoop up to 32 concurrent frames)  │ │
│  │  3. OpenCV Landmark Skeleton Mask Extraction       │ │
│  │  4. Batched Tensor Parallelism [N, 3, 224, 224]    │ │
│  │  5. Return {letter, confidence, handDetected}      │ │
│  └────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

See [ARCHITECTURE.md](ARCHITECTURE.md) for detailed system diagrams.

---

## 📁 Project Structure

```
SignHero/
│
├── asl/                              # 🎮 Next.js Frontend Application
│   ├── src/
│   │   ├── app/                      # App Router pages (game, training, testing)
│   │   ├── components/game/          # GameCanvas, NoteHighway, effects
│   │   ├── hooks/                    # useGameLoop, useSignDetection, useWebcam
│   │   └── lib/                      # Scoring, beatmaps, utilities
│   └── README.md                     # Frontend-specific docs
│
├── Base test/Sign-Language-Recognition/  # 🧠 ML Training & Model
│   ├── app/                          # API & frame extraction scripts
│   ├── model/                        # CNN architecture (MobileNetV2)
│   ├── train/                        # Training scripts
│   ├── data/weights/                 # Trained model weights (.pth)
│   └── utils/                        # Label mapping, model loading
│
├── api_server_http.py                # 🚀 FastAPI prediction server
├── api_server_mock.py                # Mock server for testing
├── start-servers.sh                  # One-click startup (Unix)
├── start-servers.bat                 # One-click startup (Windows)
│
├── models/                           # Additional model storage
├── training/                         # Training data/scripts
├── dataset/                          # Raw dataset
├── asset_generation/                 # Hand sign SVG assets
│
├── ARCHITECTURE.md                   # System architecture diagrams
├── INTEGRATION_GUIDE.md              # Full integration documentation
├── QUICKSTART_INTEGRATION.md         # Quick setup guide
└── SETUP.md                          # Environment setup
```

---

## 🚀 Quick Start

### Prerequisites

- **Python 3.10+** with pip
- **Node.js 20+** with pnpm
- **MongoDB** instance
- **Webcam** for sign detection

### 1. Start the ML Server

```bash
# Navigate to project root
cd SignHero

# Create a Python 3.10 or 3.11 virtual environment (mediapipe 0.10.9 does not support 3.12+)
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate

# Install PyTorch with the CUDA build for your GPU (cu126 works on Pascal, e.g. GTX 1070;
# use cu128 for RTX 50-series), then the pinned backend dependencies
pip install torch torchvision --index-url https://download.pytorch.org/whl/cu128
pip install -r backend/requirements.txt

# Start the API server
python api_server_http.py
# Server runs at http://localhost:4001 (WebSocket endpoint: ws://localhost:4001/ws/predict)
```

### 2. Start the Frontend

```bash
# In a new terminal
cd asl

# Install dependencies
pnpm install

# Set up environment
cp .env.example .env
# Edit .env with MongoDB URI

# Start dev server
pnpm dev
# App runs at http://localhost:4000
```

### One-Click Startup

```bash
# Unix/Mac
./start-servers.sh

# Windows
start-servers.bat
```

---

## 🛠️ Tech Stack

### Frontend (`asl/`)

| Tech | Purpose |
|------|---------|
| Next.js 15 | React framework (App Router, Turbopack) |
| TypeScript | Type safety |
| Tailwind CSS 4 | Styling |
| Framer Motion | Animations |
| tRPC | Type-safe API layer |
| Prisma + MongoDB | Database |

### Backend (`Base test/` + `api_server_http.py`)

| Tech | Purpose |
|------|---------|
| FastAPI | HTTP API server |
| PyTorch | Deep learning framework |
| MobileNetV2 | CNN architecture for classification |
| MediaPipe | Hand landmark detection |
| OpenCV | Image processing |

---

## 🧠 Model Training

The sign detection model is a MobileNetV2 trained on hand landmark features:

```
Input: 224×224 RGB image (hand feature mask)
  ↓
MobileNetV2 CNN
  ↓
Output: 26 classes (A-Z)
```

**Training Pipeline:**
1. Webcam captures hand images
2. MediaPipe extracts 21 hand landmarks
3. Landmarks drawn as feature mask on black background
4. Both original and mirrored images processed
5. Max confidence from both used for prediction

Model weights: `Base test/Sign-Language-Recognition/data/weights/asl_crop_v4_1_mobilenet_weights.pth`

---

## 📚 Documentation

| Document | Description |
|----------|-------------|
| [ARCHITECTURE.md](ARCHITECTURE.md) | System diagrams, data flow, timing model |
| [INTEGRATION_GUIDE.md](INTEGRATION_GUIDE.md) | Full integration documentation |
| [QUICKSTART_INTEGRATION.md](QUICKSTART_INTEGRATION.md) | 5-minute setup guide |
| [SETUP.md](SETUP.md) | Environment configuration |
| [asl/README.md](asl/README.md) | Frontend-specific documentation |

---

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing`)
5. Open a Pull Request

---

## 📄 License

Educational project for ASL learning.

---

## 🙏 Acknowledgments

- [T3 Stack](https://create.t3.gg/) for the Next.js template
- [MediaPipe](https://mediapipe.dev/) for hand tracking
- ASL fingerspelling resources for training data
