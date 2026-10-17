# ASL Fun Training - ML Model Integration Guide

This guide explains how to integrate the trained ASL recognition model with the rhythm game.

## Architecture Overview

```
┌─────────────────┐         WebSocket          ┌──────────────────────┐
│                 │  ws://localhost:8000/ws/  │                      │
│   Next.js Game  │◄─────────────────────────►│  ML WebSocket API    │
│   (./asl)       │    predict                 │  (./Base test/...)   │
│                 │                            │                      │
└─────────────────┘                            └──────────────────────┘
      │                                                 │
      │ Sends webcam frames                            │ Uses trained model
      │ @ 12 FPS (JPEG)                                │ MobileNetV2 + MediaPipe
      │                                                 │
      └─ Receives predictions:                         └─ Processes frames:
         - letter (A-Z)                                   1. Hand detection
         - confidence (0-1)                               2. Feature extraction
         - timestamp                                      3. CNN inference
         - handDetected (bool)                            4. Returns predictions
```

## System Components

### 1. Game Frontend (`./asl`)
- **Technology**: Next.js 15, React 19, TypeScript
- **Purpose**: Rhythm game UI and gameplay logic
- **Key Files**:
  - `src/hooks/useSignDetection.ts` - WebSocket client
  - `src/hooks/useGameLoop.ts` - Game loop with CV integration
  - `src/components/game/GameCanvas.tsx` - Main game component

### 2. ML WebSocket Server (`./Base test/Sign-Language-Recognition`)
- **Technology**: FastAPI, PyTorch, MediaPipe
- **Purpose**: Real-time ASL sign recognition
- **Key Files**:
  - `app/websocket_api.py` - WebSocket server (NEW)
  - `data/weights/asl_crop_v4_1_mobilenet_weights.pth` - Trained model
  - `utils/` - Model loading and label mapping utilities

## Setup Instructions

### Prerequisites

1. **Python Environment** (for ML server)
   - Python 3.10+
   - Conda (recommended) OR virtualenv
   - Webcam access

2. **Node.js Environment** (for game)
   - Node.js 18+
   - pnpm (package manager)

### Option A: Quick Start (Automated)

Use the provided startup script to run both servers:

```bash
# From project root
./start-servers.sh
```

This will:
1. Start the ML WebSocket server on port 8000
2. Start the Next.js game on port 3000
3. Keep both running until you press Ctrl+C

### Option B: Manual Setup

#### Step 1: Setup ML WebSocket Server

```bash
# Navigate to ML directory
cd "Base test/Sign-Language-Recognition"

# Create conda environment (if using conda)
conda env create -f environment/deployment.yml
conda activate asl-deployment

# OR create virtualenv (if not using conda)
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements-websocket.txt

# Start the WebSocket server
python -m app.websocket_api
```

The server should start on `http://localhost:8000` with WebSocket endpoint at `ws://localhost:8000/ws/predict`.

#### Step 2: Setup Game Frontend

```bash
# Navigate to game directory (from project root)
cd asl

# Install dependencies
pnpm install

# Create .env file (if it doesn't exist)
cp .env.local .env

# Start the development server
pnpm dev
```

The game should start on `http://localhost:3000`.

## Usage

1. **Open the game**: Navigate to `http://localhost:3000`

2. **Navigate to gameplay**:
   - Click on a song/level
   - Or go directly to `/game/[id]`

3. **Grant camera permissions** when prompted

4. **Start playing**:
   - The game will connect to the ML server via WebSocket
   - Your webcam feed will be processed in real-time
   - Make ASL signs matching the notes on screen
   - Hit detection is based on timing windows (Guitar Hero style)

## Protocol Specification

### WebSocket Communication

**Endpoint**: `ws://localhost:8000/ws/predict`

**Client → Server** (Binary message):
```
[8 bytes: Float64LE timestamp][N bytes: JPEG frame data]
```

**Server → Client** (JSON message):
```json
{
  "letter": "A",              // Detected letter (A-Z) or null
  "confidence": 0.95,         // Model confidence (0-1)
  "clientTimestamp": 123.45,  // Echo of client timestamp (seconds)
  "handDetected": true        // Whether a hand was detected
}
```

**Control Messages** (JSON):
```json
// Ready message (sent on connection)
{
  "type": "ready",
  "modelVersion": "v4.1-mobilenet"
}

// Error message
{
  "type": "error",
  "message": "Error description"
}
```

## Configuration

### Game Configuration (`./asl/.env.local`)

```env
# WebSocket endpoint for ML server
NEXT_PUBLIC_WS_URL=ws://localhost:8000/ws/predict

# Database (optional, for storing scores/levels)
DATABASE_URL=postgresql://postgres:password@localhost:5432/asl
```

### ML Server Configuration

Edit `Base test/Sign-Language-Recognition/app/websocket_api.py`:

```python
# Model configuration
MODEL_PATH = "../data/weights/asl_crop_v4_1_mobilenet_weights.pth"
CONFIDENCE_THRESHOLD = 0.7  # Minimum confidence to accept prediction

# MediaPipe configuration (in ASLPredictor.__init__)
self.hands = mp.solutions.hands.Hands(
    min_detection_confidence=0.7,
    min_tracking_confidence=0.7
)
```

## Troubleshooting

### WebSocket Connection Issues

**Problem**: Game shows "Disconnected" status

**Solutions**:
1. Check if ML server is running: `curl http://localhost:8000`
2. Check WebSocket URL in `.env.local`
3. Check browser console for connection errors
4. Ensure firewall allows localhost:8000

### Camera Not Working

**Problem**: Black screen or "Camera error"

**Solutions**:
1. Grant browser camera permissions
2. Check if camera is in use by another application
3. Try a different browser (Chrome recommended)
4. Check browser console for specific errors

### Model Not Loading

**Problem**: Server crashes on startup with model loading error

**Solutions**:
1. Verify model file exists: `ls "Base test/Sign-Language-Recognition/data/weights/"`
2. Check Python dependencies: `pip list | grep torch`
3. Ensure sufficient RAM (model requires ~100MB)
4. Check console for specific PyTorch errors

### Low Prediction Accuracy

**Problem**: Signs not being detected correctly

**Solutions**:
1. Ensure good lighting conditions
2. Position hand clearly in frame
3. Adjust `CONFIDENCE_THRESHOLD` in `websocket_api.py`
4. Check that you're using the correct trained model weights
5. Verify MediaPipe confidence thresholds

### Performance Issues

**Problem**: Lag or dropped frames

**Solutions**:
1. Reduce frame rate in game: edit `FRAME_RATE` in `useSignDetection.ts`
2. Use GPU acceleration if available (CUDA)
3. Close other applications using camera/CPU
4. Check network latency (even localhost can have issues)

## Development

### Testing the WebSocket API

You can test the API independently:

```python
# test_websocket.py
import asyncio
import websockets
import struct

async def test():
    async with websockets.connect('ws://localhost:8000/ws/predict') as ws:
        # Receive ready message
        msg = await ws.recv()
        print(f"Server: {msg}")

        # Send test frame
        timestamp = 0.0
        with open('test_frame.jpg', 'rb') as f:
            frame_data = f.read()

        message = struct.pack('<d', timestamp) + frame_data
        await ws.send(message)

        # Receive prediction
        prediction = await ws.recv()
        print(f"Prediction: {prediction}")

asyncio.run(test())
```

### Adding Debug Logging

**Game side** (`useSignDetection.ts`):
```typescript
ws.onmessage = (event) => {
  console.log('[WS] Received:', event.data);  // Add this
  // ... rest of handler
}
```

**Server side** (`websocket_api.py`):
```python
# Add more verbose logging
import logging
logging.basicConfig(level=logging.DEBUG)
```

## Performance Metrics

- **Frame Rate**: 12 FPS (configurable)
- **Latency**: ~30-50ms (localhost)
- **Model Inference**: ~10-20ms per frame (CPU) / ~5-10ms (GPU)
- **Prediction Accuracy**: ~95% (on test set, varies by lighting/positioning)

## Next Steps

1. **Tune Timing Windows**: Adjust `EARLY_WINDOW`, `LATE_GRACE` in `gameScoring.ts`
2. **Add Visual Feedback**: Show hand landmarks on screen
3. **Calibration**: Add a calibration screen before gameplay
4. **Multi-hand Support**: Extend for two-handed signs
5. **Performance Dashboard**: Monitor latency and accuracy in-game

## Support

For issues or questions:
- Check the [troubleshooting section](#troubleshooting) above
- Review console logs (browser DevTools + Python terminal)
- Ensure all dependencies are up to date

## File Structure

```
SignHero/
├── asl/                          # Next.js game
│   ├── src/
│   │   ├── app/game/[id]/       # Game page
│   │   ├── components/game/      # Game UI components
│   │   ├── hooks/
│   │   │   ├── useSignDetection.ts  # WebSocket client
│   │   │   ├── useGameLoop.ts       # Main game loop
│   │   │   └── useWebcam.ts         # Camera access
│   │   └── lib/
│   │       └── gameScoring.ts       # Scoring logic
│   ├── .env.local                # Environment config
│   └── package.json
│
├── Base test/Sign-Language-Recognition/  # ML model
│   ├── app/
│   │   ├── websocket_api.py     # WebSocket server (NEW)
│   │   ├── api.py               # Original HTTP API
│   │   └── frame_utils.py       # Feature extraction
│   ├── data/weights/            # Trained models
│   ├── model/                   # Model architectures
│   ├── utils/                   # Helper functions
│   └── requirements-websocket.txt  # Dependencies (NEW)
│
├── start-servers.sh             # Startup script (NEW)
└── INTEGRATION_GUIDE.md         # This file (NEW)
```
