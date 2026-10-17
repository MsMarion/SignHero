"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { api } from "~/trpc/react";
import { motion } from "framer-motion";
import { Save, Shield, User as UserIcon, Key } from "lucide-react";

export default function ProfilePage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  
  const [geminiApiKey, setGeminiApiKey] = useState("");
  const [isSuccess, setIsSuccess] = useState(false);

  const { data: userData, isLoading } = api.user.getMe.useQuery(undefined, {
    enabled: !!session,
  });

  const updateMutation = api.user.updateProfile.useMutation({
    onSuccess: () => {
      setIsSuccess(true);
      setTimeout(() => setIsSuccess(false), 3000);
    },
  });

  useEffect(() => {
    if (userData) {
      setGeminiApiKey(userData.geminiApiKey ?? "");
    }
  }, [userData]);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/auth/signin");
    }
  }, [status, router]);

  if (status === "loading" || isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[600px]">
        <div className="w-12 h-12 border-4 border-cyan-400/30 border-t-cyan-400 rounded-full animate-spin" />
      </div>
    );
  }

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    updateMutation.mutate({ geminiApiKey });
  };

  return (
    <div className="flex flex-col items-center justify-center w-full max-w-4xl px-4 py-12">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full p-10 rounded-[40px] border border-white/10 backdrop-blur-2xl shadow-2xl relative overflow-hidden"
        style={{
          background: "linear-gradient(135deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.01) 100%)",
          boxShadow: "0 0 60px rgba(168, 85, 247, 0.15)",
        }}
      >
        {/* Animated Background Accents */}
        <div className="absolute -top-32 -left-32 w-64 h-64 bg-fuchsia-600/20 blur-[100px] rounded-full animate-pulse" />
        <div className="absolute -bottom-32 -right-32 w-64 h-64 bg-cyan-600/20 blur-[100px] rounded-full animate-pulse" style={{ animationDelay: "1s" }} />

        <div className="flex flex-col md:flex-row items-center gap-8 mb-12 border-b border-white/10 pb-8">
          <div className="w-24 h-24 rounded-full bg-gradient-to-tr from-fuchsia-500 to-cyan-500 flex items-center justify-center shadow-lg shadow-fuchsia-500/20">
            <UserIcon size={48} className="text-white" />
          </div>
          <div className="text-center md:text-left">
            <h1 className="text-4xl font-black text-white tracking-tight mb-1 uppercase">HERO PROFILE</h1>
            <p className="text-cyan-400 font-mono text-sm tracking-widest">{userData?.email}</p>
          </div>
        </div>

        <form onSubmit={handleSave} className="space-y-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Hero Name Section */}
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-fuchsia-300 ml-1">
                <Shield size={14} />
                <label className="text-[10px] uppercase tracking-[3px] font-bold">Hero Name</label>
              </div>
              <div
                data-testid="profile-hero-name"
                className="w-full bg-black/40 border border-white/10 rounded-2xl px-6 py-4 text-white font-bold tracking-wide flex items-center justify-between"
              >
                <span>{userData?.heroName ?? "Not chosen yet"}</span>
                {userData?.heroName && <span className="text-[9px] uppercase tracking-[3px] text-amber-300">Locked</span>}
              </div>
              <p className="text-[9px] text-white/30 ml-1 font-medium italic">
                This is how you appear on global leaderboards. It was chosen once and cannot be changed.
              </p>
            </div>

            {/* API Key Section */}
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-cyan-300 ml-1">
                <Key size={14} />
                <label className="text-[10px] uppercase tracking-[3px] font-bold">Gemini API Key</label>
              </div>
              <input
                type="password"
                value={geminiApiKey}
                onChange={(e) => setGeminiApiKey(e.target.value)}
                className="w-full bg-black/40 border border-white/10 rounded-2xl px-6 py-4 text-white focus:outline-none focus:ring-2 focus:ring-cyan-500/50 transition-all font-mono tracking-widest"
                placeholder="AIzaSy..."
              />
              <p className="text-[9px] text-white/30 ml-1 font-medium italic">Your custom key for AI song processing. Keep it secret!</p>
            </div>
          </div>

          <div className="pt-6 flex flex-col items-center gap-4">
            <button
              type="submit"
              disabled={updateMutation.isPending}
              className="relative group px-12 py-4 rounded-2xl overflow-hidden transition-all active:scale-95"
            >
              <div className="absolute inset-0 bg-gradient-to-r from-fuchsia-600 to-cyan-600 blur-[2px] group-hover:blur-[8px] transition-all opacity-80" />
              <div className="relative flex items-center gap-3 text-white font-black tracking-[4px] uppercase text-sm">
                {updateMutation.isPending ? (
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <>
                    <Save size={18} />
                    SAVE CHANGES
                  </>
                )}
              </div>
            </button>

            {isSuccess && (
              <motion.p
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-cyan-400 font-bold text-xs tracking-widest"
              >
                ✓ PROFILE UPDATED SUCCESSFULLY
              </motion.p>
            )}
          </div>
        </form>
      </motion.div>
    </div>
  );
}
