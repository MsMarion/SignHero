import sys
import os
import time
import logging
import logging.handlers
import json
import random
import asyncio
import torch
import cv2
import numpy as np
import mediapipe as mp
from fastapi import FastAPI, File, UploadFile, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from torchvision import transforms
from PIL import Image
import io

from mediapipe.framework.formats import landmark_pb2

# Setup paths to import from existing codebase
BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "Base test/Sign-Language-Recognition"))
sys.path.insert(0, BASE_DIR)

from utils import load_model, LabelMapper
from app.frame_utils import extract_hand_features_mask, draw_hand_features

# ─── Structured JSON Logging ───────────────────────────────────────────────────
class JSONFormatter(logging.Formatter):
    def format(self, record):
        log_entry = {
            "timestamp": self.formatTime(record, self.datefmt),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
            "module": record.module,
            "line": record.lineno,
        }
        if record.exc_info and record.exc_info[0]:
            log_entry["exception"] = self.formatException(record.exc_info)
        return json.dumps(log_entry)

log_handler = logging.StreamHandler()
log_handler.setFormatter(JSONFormatter())
logging.root.handlers = []
logging.root.addHandler(log_handler)
logging.root.setLevel(logging.INFO)
logger = logging.getLogger("ASL_API")

from contextlib import asynccontextmanager

@asynccontextmanager
async def lifespan_handler(app: FastAPI):
    global resources, batch_queue
    try:
        resources = DetectionResources()
        batch_queue = asyncio.Queue()
        asyncio.create_task(batch_processor())
        logger.info("ASL Dynamic Micro-Batcher Resources Loaded Successfully")
    except Exception as e:
        logger.error(f"Failed to load resources: {e}")
        raise e
    yield

app = FastAPI(
    title="ASL Real Inference API",
    description="Server for real-time ASL hand sign detection using PyTorch model with Dynamic Micro-Batcher on RTX 5090",
    version="2.0.0",
    lifespan=lifespan_handler
)

# CORS - Secure configuration for allowed origins
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:4000", "http://127.0.0.1:3000", "http://127.0.0.1:4000"],
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)

class SignPrediction(BaseModel):
    letter: str
    confidence: float
    timestamp: float
    clientTimestamp: float
    handDetected: bool

# Convert client JSON coordinates to true MediaPipe Protobuf NormalizedLandmarkList
def create_normalized_landmark_list(landmarks_list):
    proto_list = landmark_pb2.NormalizedLandmarkList()
    for pt in landmarks_list:
        l = proto_list.landmark.add()
        l.x = pt['x']
        l.y = pt['y']
        l.z = pt.get('z', 0.0)
    return proto_list

# Global Resources
class DetectionResources:
    def __init__(self):
        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        logger.info(f"Using device: {self.device}")
        
        self.model_path = os.path.join(BASE_DIR, 'data/weights/asl_crop_v4_1_mobilenet_weights.pth')
        if not os.path.exists(self.model_path):
             self.model_path = os.path.join(BASE_DIR, 'data/weights/asl_crop_v4_0_mobilenet_weights.pth')

        logger.info(f"Initializing model tracking for: {self.model_path}")
        self.model = None
        self.in_vram = False
        self.last_activity_time = time.time()
        self.vram_lock = asyncio.Lock()
        
        # Initial cold load
        self.load_into_vram()
        
        # MediaPipe for fallback HTTP POST endpoint
        self.hands = mp.solutions.hands.Hands(
            static_image_mode=True,
            max_num_hands=1,
            min_detection_confidence=0.5
        )
        
        self.transform = transforms.Compose([
            transforms.ToPILImage(),
            transforms.Resize((224, 224)),
            transforms.ToTensor(),
            transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225])
        ])
        
        self.confidence_threshold = 0.5

    def load_into_vram(self):
        logger.info("⚡ [VRAM Watchdog] Loading PyTorch CNN weights into GPU VRAM...")
        start = time.time()
        self.model = load_model(self.model_path, self.device)
        self.model.eval()
        self.in_vram = True
        logger.info(f"✅ [VRAM Watchdog] Model loaded successfully in {(time.time() - start)*1000:.2f}ms")

    async def ensure_model_in_vram(self):
        self.last_activity_time = time.time()
        if self.in_vram and self.model is not None:
            return
            
        async with self.vram_lock:
            if self.in_vram and self.model is not None:
                return
            self.load_into_vram()

    async def check_idle_eviction(self, timeout=60.0):
        async with self.vram_lock:
            if self.in_vram and (time.time() - self.last_activity_time > timeout):
                logger.info(f"💤 [VRAM Watchdog] Zero traffic for {timeout}s. Offloading PyTorch model from GPU VRAM...")
                del self.model
                self.model = None
                if torch.cuda.is_available():
                    torch.cuda.empty_cache()
                self.in_vram = False
                logger.info("🗑️ [VRAM Watchdog] GPU VRAM cleared and returned to host pool successfully.")

resources = None
batch_queue = None
batch_stats = {
    "total_batches": 0,
    "total_frames": 0,
    "avg_batch_size": 0.0,
    "last_batch_time": 0.0
}

MAX_BATCH_SIZE = 32
BATCH_TIMEOUT = 0.01  # 10ms sweep
MAX_WS_CONNECTIONS = 50  # Hard cap on concurrent WebSocket players
active_ws_connections = 0

async def batch_processor():
    logger.info("Starting RTX 5090 Dynamic Micro-Batcher Loop")
    global batch_stats
    
    while True:
        await asyncio.sleep(BATCH_TIMEOUT)
        
        if batch_queue.empty():
            if resources:
                await resources.check_idle_eviction(timeout=60.0)
            continue
            
        batch_items = []
        while not batch_queue.empty() and len(batch_items) < MAX_BATCH_SIZE:
            try:
                item = batch_queue.get_nowait()
                batch_items.append(item)
            except asyncio.QueueEmpty:
                break
                
        if not batch_items:
            continue
            
        batch_start_time = time.time()
        
        try:
            orig_tensors = []
            mirror_tensors = []
            
            for item in batch_items:
                proto_hl = create_normalized_landmark_list(item["landmarks"])
                canvas = np.zeros((240, 320, 3), dtype=np.uint8)
                
                extract_hand_features_mask(canvas, proto_hl)
                mirror_canvas = cv2.flip(canvas, 1)
                
                orig_t = resources.transform(canvas)
                mirror_t = resources.transform(mirror_canvas)
                
                orig_tensors.append(orig_t)
                mirror_tensors.append(mirror_t)
                
            batch_orig = torch.stack(orig_tensors).to(resources.device)
            batch_mirror = torch.stack(mirror_tensors).to(resources.device)
            
            await resources.ensure_model_in_vram()
            
            with torch.no_grad():
                orig_output = resources.model(batch_orig)
                mirror_output = resources.model(batch_mirror)
                
                final_output = torch.max(orig_output, mirror_output)
                probs = torch.nn.functional.softmax(final_output, dim=1)
                conf_tensor, predicted_classes = torch.max(probs, 1)
                
            for i, item in enumerate(batch_items):
                conf = conf_tensor[i].item()
                pred_class = predicted_classes[i].item()
                
                if conf > resources.confidence_threshold:
                    letter = LabelMapper.index_to_label(pred_class)
                else:
                    letter = "None"
                    
                prediction_dict = {
                    "letter": letter,
                    "confidence": conf,
                    "timestamp": time.time(),
                    "clientTimestamp": item["client_timestamp"],
                    "handDetected": True
                }
                
                if not item["future"].done():
                    item["future"].set_result(prediction_dict)
                    
            batch_duration = time.time() - batch_start_time
            
            batch_stats["total_batches"] += 1
            batch_stats["total_frames"] += len(batch_items)
            batch_stats["avg_batch_size"] = batch_stats["total_frames"] / batch_stats["total_batches"]
            batch_stats["last_batch_time"] = batch_duration
            
            if len(batch_items) > 1:
                logger.info(f"[Batcher] Processed tensor group of size {len(batch_items)} in {batch_duration:.4f}s on {resources.device}")
        except Exception as e:
            logger.error(f"[Batcher] Error processing batch: {e}", exc_info=True)
            for item in batch_items:
                if not item["future"].done():
                    item["future"].set_result({
                        "letter": "None", "confidence": 0.0, "timestamp": time.time(), "clientTimestamp": item["client_timestamp"], "handDetected": False
                    })

@app.get("/")
async def root():
    return {"message": "ASL Dynamic Micro-Batcher Ready"}

@app.get("/concurrency_status")
async def concurrency_status():
    return {
        "device": str(resources.device) if resources else "unknown",
        "queue_depth": batch_queue.qsize() if batch_queue else 0,
        "max_batch_size": MAX_BATCH_SIZE,
        "batch_stats": batch_stats,
        "mode": "dynamic_micro_batching"
    }

@app.websocket("/ws/predict")
async def websocket_endpoint(websocket: WebSocket):
    global active_ws_connections
    
    # Connection cap enforcement
    if active_ws_connections >= MAX_WS_CONNECTIONS:
        await websocket.close(code=1013, reason="Server at capacity")
        logger.warning(f"Rejected WebSocket connection: {active_ws_connections}/{MAX_WS_CONNECTIONS} slots full")
        return
    
    await websocket.accept()
    active_ws_connections += 1
    logger.info(f"WebSocket connected ({active_ws_connections}/{MAX_WS_CONNECTIONS} active)")
    await websocket.send_json({"type": "ready", "message": "Connected to RTX 5090 Micro-Batcher"})
    
    last_frame_time = 0
    last_reply = None

    try:
        while True:
            data = await websocket.receive_json()

            # Anti-spam rate limiter (~35 FPS max per socket). The client sends one frame at a
            # time and waits for the reply, so a dropped frame must still get an answer or the
            # client stalls forever; repeat the last prediction instead of staying silent.
            now = time.time()
            if now - last_frame_time < 0.028: # < 28ms
                reply = dict(last_reply) if last_reply else {"letter": "None", "confidence": 0.0, "handDetected": False}
                reply["timestamp"] = time.time()
                reply["clientTimestamp"] = data.get("clientTimestamp", now)
                await websocket.send_json(reply)
                continue
            last_frame_time = now
            
            client_timestamp = data.get("clientTimestamp", now)
            hand_detected = data.get("handDetected", False)
            landmarks_list = data.get("landmarks", [])
            
            # Security Sanitization: Ensure landmarks is exactly a list of 21 dictionaries with numeric x, y
            valid_landmarks = (
                isinstance(landmarks_list, list) and 
                len(landmarks_list) == 21 and 
                all(isinstance(pt, dict) and isinstance(pt.get('x'), (int, float)) and isinstance(pt.get('y'), (int, float)) for pt in landmarks_list)
            )
            
            if not hand_detected or not valid_landmarks:
                last_reply = {
                    "letter": "None",
                    "confidence": 0.0,
                    "timestamp": time.time(),
                    "clientTimestamp": client_timestamp,
                    "handDetected": False
                }
                await websocket.send_json(last_reply)
                continue
                
            loop = asyncio.get_running_loop()
            future = loop.create_future()
            
            await batch_queue.put({
                "future": future,
                "client_timestamp": client_timestamp,
                "landmarks": landmarks_list
            })
            
            prediction = await future
            last_reply = prediction
            await websocket.send_json(prediction)
            
    except WebSocketDisconnect:
        pass
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
    finally:
        active_ws_connections -= 1
        logger.info(f"WebSocket disconnected ({active_ws_connections}/{MAX_WS_CONNECTIONS} active)")

# Fallback HTTP POST endpoint for legacy clients or test scripts
@app.post("/predict_frame")
async def predict_frame(file: UploadFile = File(...), client_timestamp: float = 0.0):
    contents = await file.read()
    nparr = np.frombuffer(contents, np.uint8)
    frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    
    if frame is None:
        return SignPrediction(
            letter="None", confidence=0.0, timestamp=time.time(), clientTimestamp=client_timestamp, handDetected=False
        )

    frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
    results = resources.hands.process(frame_rgb)
    
    detected_letter = "None"
    confidence = 0.0
    hand_detected = False
    
    if results.multi_hand_landmarks:
        hand_detected = True
        hand_landmarks = results.multi_hand_landmarks[0]
        
        orig_features_mask = np.zeros_like(frame)
        extract_hand_features_mask(orig_features_mask, hand_landmarks)
        mirror_features_mask = cv2.flip(orig_features_mask, 1)
        
        orig_input = resources.transform(orig_features_mask).unsqueeze(0).to(resources.device)
        mirror_input = resources.transform(mirror_features_mask).unsqueeze(0).to(resources.device)
        
        with torch.no_grad():
            orig_output = resources.model(orig_input)
            mirror_output = resources.model(mirror_input)
            
            final_output = torch.max(orig_output, mirror_output)
            probs = torch.nn.functional.softmax(final_output, dim=1)
            conf_tensor, predicted_class = torch.max(probs, 1)
            
            current_conf = conf_tensor.item()
            if current_conf > resources.confidence_threshold:
                detected_letter = LabelMapper.index_to_label(predicted_class.item())
                confidence = current_conf
            else:
                detected_letter = "None"
                confidence = current_conf

    return SignPrediction(
        letter=detected_letter, confidence=confidence, timestamp=time.time(), clientTimestamp=client_timestamp, handDetected=hand_detected
    )

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=4001)
