"use client";

import { useState, useRef, useEffect } from "react";
import { trpc } from "@/trpc/client";

interface KeyPress {
    key: string;
    timeElapsed: number;
}

type AudioTab = "youtube" | "upload";

export default function DevModePage() {
    const [audioUrl, setAudioUrl] = useState<string | null>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [isRecording, setIsRecording] = useState(false);
    const [keyPresses, setKeyPresses] = useState<KeyPress[]>([]);

    // Tab state
    const [activeTab, setActiveTab] = useState<AudioTab>("youtube");

    // YouTube
    const [youtubeUrl, setYoutubeUrl] = useState("");
    const [videoId, setVideoId] = useState("");
    const [isDownloading, setIsDownloading] = useState(false);
    const [downloadProgress, setDownloadProgress] = useState(0);
    const [downloadError, setDownloadError] = useState("");
    const [videoTitle, setVideoTitle] = useState("");
    const [isTranscribing, setIsTranscribing] = useState(false);

    // File upload
    const [audioFile, setAudioFile] = useState<File | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Form fields
    const [songName, setSongName] = useState("");
    const [albumName, setAlbumName] = useState("");
    const [thumbnailFile, setThumbnailFile] = useState<File | null>(null);

    // S3 URLs
    const [uploadedAudioUrl, setUploadedAudioUrl] = useState<string | null>(null);
    const [uploadedThumbnailUrl, setUploadedThumbnailUrl] = useState<string | null>(null);
    const [isUploading, setIsUploading] = useState(false);

    const [isSaving, setIsSaving] = useState(false);
    const [saveMessage, setSaveMessage] = useState("");
    const [audioDuration, setAudioDuration] = useState(0);

    const audioRef = useRef<HTMLAudioElement>(null);
    const thumbnailInputRef = useRef<HTMLInputElement>(null);

    const createSong = trpc.song.create.useMutation();

    // Key press listener while recording
    useEffect(() => {
        const handleKeyPress = (e: KeyboardEvent) => {
            if (isRecording && audioRef.current) {
                const keyLog: KeyPress = {
                    key: e.key,
                    timeElapsed: audioRef.current.currentTime,
                };
                setKeyPresses((prev) => [...prev, keyLog]);
            }
        };

        window.addEventListener("keydown", handleKeyPress);
        return () => window.removeEventListener("keydown", handleKeyPress);
    }, [isRecording]);

    const handleYoutubeDownload = async () => {
        if (!youtubeUrl.trim()) {
            setDownloadError("Please enter a YouTube URL");
            return;
        }

        setIsDownloading(true);
        setDownloadProgress(0);
        setDownloadError("");
        setVideoTitle("");
        setUploadedAudioUrl(null);

        try {
            const response = await fetch("/api/youtube", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ url: youtubeUrl }),
            });

            const data = await response.json();

            if (data.success) {
                // Construct MinIO URL (Standard: http://localhost:4003/signhero/key)
                const fullAudioUrl = `/api/media/${data.audioUrl}`;
                const fullThumbUrl = `/api/media/${data.thumbnailUrl}`;

                setAudioUrl(fullAudioUrl);
                setUploadedAudioUrl(data.audioUrl);
                setUploadedThumbnailUrl(data.thumbnailUrl);
                setVideoTitle(data.title);
                setVideoId(data.videoId);
                setSongName(data.title);
                setAudioDuration(data.duration);

                // Auto-generate standardized beatmap (A @ 5s)
                const initialKeyPresses: KeyPress[] = [];
                const interval = 5.0;
                for (let time = 5.0; time < data.duration - 2; time += interval) {
                    initialKeyPresses.push({
                        key: "a",
                        timeElapsed: time
                    });
                }
                setKeyPresses(initialKeyPresses);

                console.log("✅ Bulletproof Import Complete:", data.title);
            } else {
                throw new Error(data.error || "Failed to import video");
            }
        } catch (error) {
            setDownloadError(error instanceof Error ? error.message : "Failed to download audio");
        } finally {
            setIsDownloading(false);
        }
    };

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file && file.type.startsWith("audio/")) {
            if (audioUrl) URL.revokeObjectURL(audioUrl);
            setAudioFile(file);
            setAudioUrl(URL.createObjectURL(file));
            setKeyPresses([]);
            
            if (!songName) setSongName(file.name.replace(/\.[^/.]+$/, ""));

            setIsUploading(true);
            try {
                const formData = new FormData();
                formData.append('file', file);
                formData.append('folder', 'audio');
                const uploadResponse = await fetch('/api/upload', { method: 'POST', body: formData });
                const uploadData = await uploadResponse.json();
                if (uploadData.success && uploadData.url) setUploadedAudioUrl(uploadData.url);
            } finally {
                setIsUploading(false);
            }
        }
    };

    const handleThumbnailUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file && file.type.startsWith("image/")) {
            setThumbnailFile(file);
            try {
                const formData = new FormData();
                formData.append('file', file);
                formData.append('folder', 'thumbnails');
                const uploadResponse = await fetch('/api/upload', { method: 'POST', body: formData });
                const uploadData = await uploadResponse.json();
                if (uploadData.success && uploadData.url) setUploadedThumbnailUrl(uploadData.url);
            } catch (error) {
                console.error("Thumbnail upload error:", error);
            }
        }
    };

    const handleThumbnailClick = () => thumbnailInputRef.current?.click();
    const handleUploadClick = () => fileInputRef.current?.click();

    const startRecording = () => {
        if (!audioRef.current) return;
        setKeyPresses([]);
        setIsRecording(true);
        audioRef.current.currentTime = 0;
        audioRef.current.play();
        setIsPlaying(true);
    };

    const stopRecording = () => {
        if (!audioRef.current) return;
        audioRef.current.pause();
        setIsPlaying(false);
        setIsRecording(false);
    };

    const handleAudioEnded = () => {
        setIsPlaying(false);
        setIsRecording(false);
    };

    const handleRemoveAudio = () => {
        if (audioUrl) URL.revokeObjectURL(audioUrl);
        setAudioUrl(null);
        setAudioFile(null);
        setUploadedAudioUrl(null);
        setIsPlaying(false);
        setIsRecording(false);
        setKeyPresses([]);
        setYoutubeUrl("");
        setVideoTitle("");
    };

    const deleteKeyPress = (index: number) => {
        setKeyPresses((prev) => prev.filter((_, i) => i !== index));
    };

    const handleAutoGenerate = async () => {
        if (!audioFile && !videoId) return;
        setIsTranscribing(true);
        try {
            const formData = new FormData();
            if (activeTab === "upload" && audioFile) formData.append("file", audioFile);
            else if (activeTab === "youtube" && videoId) formData.append("videoId", videoId);

            const response = await fetch("/api/transcribe", { method: "POST", body: formData });
            const data = await response.json();
            if (data.success && data.interactions) setKeyPresses(data.interactions);
        } finally {
            setIsTranscribing(false);
        }
    };

    const handleGenerateRandomBeatmap = () => {
        if (!audioDuration) return;
        
        const newKeyPresses: KeyPress[] = [];
        const interval = 2.0; // Every 2 seconds
        const keys = "aslhero";
        
        for (let time = 2.0; time < audioDuration - 2; time += interval) {
            newKeyPresses.push({
                key: keys[Math.floor(Math.random() * keys.length)],
                timeElapsed: time
            });
        }
        
        setKeyPresses(newKeyPresses);
    };

    const handleSave = async () => {
        if (!songName || !albumName) {
            setSaveMessage("Please fill title and album");
            return;
        }

        setIsSaving(true);
        try {
            await createSong.mutateAsync({
                songName,
                albumName,
                isCommunity: true,
                ...(thumbnailFile && { thumbnailName: thumbnailFile.name }),
                ...(uploadedThumbnailUrl && { thumbnailUrl: uploadedThumbnailUrl }),
                ...(uploadedAudioUrl && { audioUrl: uploadedAudioUrl }),
                ...(keyPresses.length > 0 && { interactions: keyPresses }),
            });
            setSaveMessage("Saved to community!");
            setSongName("");
            setAlbumName("");
            setKeyPresses([]);
        } catch (error) {
            setSaveMessage("Failed to save.");
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="w-full h-full flex flex-col">
            <div className="text-center w-full mb-8">
                        <h1 className="text-6xl font-[display-font] text-white mb-4 animate-pulse"
                            style={{ textShadow: "0 0 20px rgba(45,226,230,0.5), 0 0 40px rgba(146,0,117,0.3)" }}>
                            DEV MODE
                        </h1>
                    </div>

                    <div className="flex flex-col gap-8 w-full items-center">
                        {/* Song Details Section */}
                        <div className="w-full max-w-2xl flex flex-col gap-6 rounded-2xl border-1 border-white/20 p-8 bg-black/20">
                            <h2 className="text-2xl font-bold text-white text-center">SONG DETAILS</h2>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="flex flex-col gap-2">
                                    <label className="text-purple-200 text-sm">SONG TITLE</label>
                                    <input type="text" value={songName} onChange={(e) => setSongName(e.target.value)} className="bg-white/5 border-1 border-white/20 rounded-lg p-3 text-white focus:outline-none focus:border-cyan-400" />
                                </div>
                                <div className="flex flex-col gap-2">
                                    <label className="text-purple-200 text-sm">ALBUM NAME</label>
                                    <input type="text" value={albumName} onChange={(e) => setAlbumName(e.target.value)} className="bg-white/5 border-1 border-white/20 rounded-lg p-3 text-white focus:outline-none focus:border-cyan-400" />
                                </div>
                            </div>
                            <div className="flex flex-col items-center gap-4">
                                {(uploadedThumbnailUrl || thumbnailFile) && (
                                    <div className="w-40 h-40 rounded-xl overflow-hidden border-2 border-cyan-400 shadow-[0_0_15px_rgba(45,226,230,0.5)]">
                                        <img 
                                            src={thumbnailFile ? URL.createObjectURL(thumbnailFile) : `/api/media/${uploadedThumbnailUrl}`} 
                                            alt="Thumbnail Preview" 
                                            className="w-full h-full object-cover"
                                        />
                                    </div>
                                )}
                                <button onClick={handleThumbnailClick} className="w-full border-2 border-dashed border-white/20 rounded-xl p-4 text-white hover:bg-white/5 transition-all">
                                    {thumbnailFile ? `FILE: ${thumbnailFile.name}` : uploadedThumbnailUrl ? "REPLACE THUMBNAIL" : "UPLOAD THUMBNAIL"}
                                </button>
                            </div>
                            <input ref={thumbnailInputRef} type="file" accept="image/*" onChange={handleThumbnailUpload} className="hidden" />
                        </div>

                        {/* Audio Source Section */}
                        <div className="w-full max-w-2xl flex flex-col gap-6 rounded-2xl border-1 border-white/20 p-8 bg-black/20">
                            <h2 className="text-2xl font-bold text-white text-center">AUDIO SOURCE</h2>
                            <div className="flex rounded-lg border-1 border-white/20 overflow-hidden">
                                <button onClick={() => setActiveTab("youtube")} className={`flex-1 p-3 font-bold transition-all ${activeTab === "youtube" ? "bg-white text-black" : "text-white hover:bg-white/10"}`}>YOUTUBE</button>
                                <button onClick={() => setActiveTab("upload")} className={`flex-1 p-3 font-bold transition-all ${activeTab === "upload" ? "bg-white text-black" : "text-white hover:bg-white/10"}`}>UPLOAD</button>
                            </div>
                            {activeTab === "youtube" ? (
                                <div className="flex flex-col gap-3">
                                    <input type="text" value={youtubeUrl} onChange={(e) => setYoutubeUrl(e.target.value)} placeholder="PASTE YOUTUBE URL..." className="bg-white/5 border-1 border-white/20 rounded-lg p-3 text-white" />
                                    <button onClick={handleYoutubeDownload} disabled={isDownloading} className="bg-cyan-400 text-black font-black p-3 rounded-lg hover:scale-[1.02] active:scale-[0.98] transition-all">
                                        {isDownloading ? "DOWNLOADING..." : "FETCH AUDIO"}
                                    </button>
                                </div>
                            ) : (
                                <button onClick={handleUploadClick} className="bg-magenta-500 text-white font-black p-4 rounded-lg hover:scale-[1.02] transition-all">
                                    {audioFile ? `FILE: ${audioFile.name}` : "SELECT MP3 FILE"}
                                </button>
                            )}
                            <input ref={fileInputRef} type="file" accept="audio/*" onChange={handleFileUpload} className="hidden" />
                        </div>

                        {/* Player Section */}
                        {audioUrl && (
                            <div className="w-full max-w-2xl flex flex-col gap-6 rounded-2xl border-1 border-white/40 p-8 bg-white/5 shadow-[0_0_30px_rgba(255,255,255,0.1)]">
                                <audio ref={audioRef} src={audioUrl} onEnded={handleAudioEnded} onLoadedMetadata={() => setAudioDuration(audioRef.current?.duration || 0)} className="hidden" />
                                <div className="flex gap-4">
                                    <button onClick={isRecording ? stopRecording : startRecording} className={`flex-1 p-4 rounded-xl font-black text-lg transition-all ${isRecording ? "bg-red-500 text-white animate-pulse" : "bg-white text-black"}`}>
                                        {isRecording ? "STOP RECORDING" : "START RECORDING"}
                                    </button>
                                    <button onClick={handleAutoGenerate} disabled={isTranscribing} className="flex-1 p-4 rounded-xl bg-purple-600 text-white font-black hover:bg-purple-500 transition-all text-xs">
                                        {isTranscribing ? "GENERATING..." : "AI AUTO-GEN"}
                                    </button>
                                    <button onClick={handleGenerateRandomBeatmap} className="flex-1 p-4 rounded-xl bg-green-600 text-white font-black hover:bg-green-500 transition-all text-xs">
                                        GENERATE RANDOM
                                    </button>
                                </div>
                                <div className="w-full h-4 bg-black/40 rounded-full overflow-hidden border-1 border-white/10">
                                    <div className="h-full bg-cyan-400 shadow-[0_0_15px_#2de2e6]" style={{ width: `${(audioRef.current?.currentTime || 0) / (audioDuration || 1) * 100}%` }} />
                                </div>
                            </div>
                        )}

                        {/* Timeline Section */}
                        <div className="w-full max-w-4xl flex flex-col gap-4">
                            <div className="flex justify-between items-center px-4">
                                <h3 className="text-xl font-black text-white tracking-widest">TIMELINE ({keyPresses.length})</h3>
                                <button onClick={() => setKeyPresses([])} className="text-red-400 text-sm hover:underline">CLEAR ALL</button>
                            </div>
                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                                {keyPresses.map((kp, i) => (
                                    <div key={i} className="flex items-center justify-between bg-white/10 border-1 border-white/20 p-3 rounded-xl group">
                                        <span className="font-mono text-cyan-400 font-bold text-lg">{kp.key.toUpperCase()}</span>
                                        <span className="text-xs text-white/60">{kp.timeElapsed.toFixed(2)}s</span>
                                        <button onClick={() => deleteKeyPress(i)} className="text-red-500 opacity-0 group-hover:opacity-100 transition-all text-xl">×</button>
                                    </div>
                                ))}
                                {keyPresses.length === 0 && <p className="col-span-full text-center text-white/20 italic py-12 border-1 border-dashed border-white/10 rounded-2xl">Awaiting data...</p>}
                            </div>
                        </div>

                        {/* Final Save */}
                        <button onClick={handleSave} disabled={isSaving} className="w-full max-w-md py-5 rounded-2xl bg-gradient-to-r from-cyan-400 to-blue-500 text-black font-black text-2xl shadow-[0_0_50px_rgba(45,226,230,0.3)] hover:scale-[1.05] active:scale-[0.95] transition-all mt-8">
                            {isSaving ? "SAVING..." : "SAVE TO COMMUNITY"}
                        </button>
                        {saveMessage && <p className="text-white text-center font-bold animate-bounce">{saveMessage}</p>}
            </div>
        </div>
    );
}
