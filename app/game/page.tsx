"use client";

/* cspell:ignore cutscene WASD اندر نہیں Haveli DARWAZA KAMRA TEHKHANA Qafas gameover Tasbeeh Aabis Djinn Djinn-E-Qafas */

import { useState, useEffect, useRef, useCallback } from "react";
import dynamic from "next/dynamic";
import { AudioEngine } from "../lib/audio-engine";

const HaveliScene = dynamic(() => import("../components/HaveliScene"), { ssr: false });

const ZONE_NAMES: Record<number, string> = { 1: "DARWAZA", 2: "KAMRA", 3: "TEHKHANA" };
const REQUIRED_ITEMS = 6;

type Difficulty = "easy" | "medium" | "hard" | "impossible";

const DIFFICULTY_CONFIG: Record<Difficulty, { label: string; hint: string; startSanity: number; drainEveryMs: number; drainAmount: number }> = {
  easy: { label: "EASY", hint: "Safer pace, more room to explore.", startSanity: 100, drainEveryMs: 26000, drainAmount: 1 },
  medium: { label: "MEDIUM", hint: "Balanced horror, the intended route.", startSanity: 100, drainEveryMs: 17000, drainAmount: 1 },
  hard: { label: "HARD", hint: "Faster curse, tighter breathing room.", startSanity: 95, drainEveryMs: 10000, drainAmount: 2 },
  impossible: { label: "IMPOSSIBLE", hint: "Relentless pursuit. No mercy.", startSanity: 75, drainEveryMs: 4200, drainAmount: 4 },
};

export default function GameUI() {
  const [sanity, setSanity]           = useState(100);
  const [inventory, setInventory]     = useState<string[]>([]);
  const [zone, setZone]               = useState(1);
  const [narrative, setNarrative]     = useState("The rusted gates moan. Six sacred vessels were lost to the Bride of the Haveli. Reclaim them from the shadows, or join her in the cage of the Qafas.");
  const [nearItem, setNearItem]       = useState<string>("");
  const [gamePhase, setGamePhase]     = useState<"title" | "playing" | "gameover" | "won">("title");
  const [locked, setLocked]           = useState(false);
  const [fearPulse, setFearPulse]     = useState(0);
  const [started, setStarted]         = useState(false);
  const [showChoices, setShowChoices] = useState(false);
  const [choices, setChoices]         = useState<string[]>([]);
  const [difficulty, setDifficulty]   = useState<Difficulty>("medium");
  const [glitchIntensity, setGlitchIntensity] = useState(0);
  const startedAtRef = useRef<number | null>(null);
  const lastGeminiCallAtRef = useRef(0);
  const lastHauntAtRef = useRef(0);
  const musicRafRef = useRef<number | null>(null);
  const endingAudioPlayedRef = useRef<"gameover" | "won" | null>(null);
  const sanityCollapseTriggeredRef = useRef(false);
  const titleScrollRef = useRef<HTMLDivElement>(null);
  const titleTouchStartYRef = useRef(0);
  const titleTouchStartScrollRef = useRef(0);
  const hasTasbeeh = inventory.includes("torn_tasbeeh");

  useEffect(() => {
    if (started) return;

    const getScrollElement = () => document.scrollingElement ?? document.documentElement;

    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) < Math.abs(e.deltaX)) return;
      window.scrollBy({ top: e.deltaY, left: 0, behavior: "auto" });
      e.preventDefault();
    };

    const onTouchStart = (e: TouchEvent) => {
      const scrollElement = getScrollElement();
      titleTouchStartYRef.current = e.touches[0]?.clientY ?? 0;
      titleTouchStartScrollRef.current = scrollElement.scrollTop;
    };

    const onTouchMove = (e: TouchEvent) => {
      const scrollElement = getScrollElement();
      const currentY = e.touches[0]?.clientY ?? 0;
      const deltaY = titleTouchStartYRef.current - currentY;
      scrollElement.scrollTop = titleTouchStartScrollRef.current + deltaY;
      e.preventDefault();
    };

    document.addEventListener("wheel", onWheel, { passive: false });
    document.addEventListener("touchstart", onTouchStart, { passive: true });
    document.addEventListener("touchmove", onTouchMove, { passive: false });

    return () => {
      document.removeEventListener("wheel", onWheel);
      document.removeEventListener("touchstart", onTouchStart);
      document.removeEventListener("touchmove", onTouchMove);
    };
  }, [started]);

  // Refs for Three.js live values
  const sanityRef = useRef(100);
  useEffect(() => {
    if (gamePhase === "gameover" || gamePhase === "won") {
      if (endingAudioPlayedRef.current !== gamePhase) {
        endingAudioPlayedRef.current = gamePhase;
        AudioEngine.playEndingScreenAudio(gamePhase === "gameover");
      }
    } else {
      endingAudioPlayedRef.current = null;
      AudioEngine.stopEndingScreenAudio();
    }

    return () => {
      if (gamePhase !== "playing") {
        AudioEngine.stopEndingScreenAudio();
      }
    };
  }, [gamePhase]);

  useEffect(() => {
    if (gamePhase === "playing") {
      sanityCollapseTriggeredRef.current = false;
    }
  }, [gamePhase]);
  const zoneRef   = useRef(1);
  useEffect(() => { sanityRef.current = sanity; }, [sanity]);
  useEffect(() => { zoneRef.current = zone; }, [zone]);

  // Audio init
  useEffect(() => {
    document.addEventListener("click", () => AudioEngine.init(), { once: true });
  }, []);

  useEffect(() => {
    if (gamePhase === "playing" && started) {
      AudioEngine.configureHorrorMusic(difficulty);
      AudioEngine.startHorrorMusic();
      const driveMusic = () => {
        const fear = Math.max(0, Math.min(1, fearPulse));
        const itemPressure = Math.min(1, inventory.length / REQUIRED_ITEMS);
        const sanityPressure = Math.max(0, 1 - sanity / 100);
        const tension = Math.max(fear, itemPressure * 0.7 + sanityPressure * 0.65);
        AudioEngine.updateHorrorMusic(tension);
        musicRafRef.current = requestAnimationFrame(driveMusic);
      };
      musicRafRef.current = requestAnimationFrame(driveMusic);
    } else {
      if (musicRafRef.current !== null) {
        cancelAnimationFrame(musicRafRef.current);
        musicRafRef.current = null;
      }
      AudioEngine.stopHorrorMusic();
    }

    return () => {
      if (musicRafRef.current !== null) {
        cancelAnimationFrame(musicRafRef.current);
        musicRafRef.current = null;
      }
    };
  }, [gamePhase, started, fearPulse, inventory.length, sanity, difficulty]);

  // Passive sanity drain
  useEffect(() => {
    if (gamePhase !== "playing") return;
    const config = DIFFICULTY_CONFIG[difficulty];
    const t = setInterval(() => {
      setSanity(s => {
        const desperateDrain =
          (difficulty === "medium" && s < 50 ? 1 : 0) +
          (difficulty === "hard" && s < 70 ? 1 : 0) +
          (difficulty === "hard" && s < 35 ? 1 : 0) +
          (difficulty === "impossible" && s < 80 ? 1 : 0) +
          (difficulty === "impossible" && s < 55 ? 1 : 0) +
          (difficulty === "impossible" && s < 30 ? 2 : 0) +
          (difficulty === "impossible" && s < 12 ? 3 : 0);
        const ns = Math.max(0, s - config.drainAmount - desperateDrain);
        if (ns <= 0 && !sanityCollapseTriggeredRef.current) {
          sanityCollapseTriggeredRef.current = true;
          setNarrative("Your sanity splinters. The Haveli becomes the inside of your own skull.");
          AudioEngine.playJinnLaugh(1);
          AudioEngine.horrorSting(1);
          AudioEngine.jumpScare();
          setFearPulse(1);
          setGamePhase("gameover");
        }
        return ns;
      });
    }, config.drainEveryMs);
    return () => clearInterval(t);
  }, [gamePhase, difficulty]);

  useEffect(() => {
    if (gamePhase !== "playing") return;
    if (startedAtRef.current === null) startedAtRef.current = Date.now();
  }, [gamePhase]);

  useEffect(() => {
    if (gamePhase !== "playing") return;

    const config = DIFFICULTY_CONFIG[difficulty];
    const hauntDelay = difficulty === "easy" ? 36000 : difficulty === "medium" ? 26000 : difficulty === "hard" ? 18000 : 8500;

    const t = setInterval(() => {
      const now = Date.now();
      if (now - lastHauntAtRef.current < hauntDelay) return;
      if (Math.random() > (difficulty === "easy" ? 0.35 : difficulty === "medium" ? 0.55 : difficulty === "hard" ? 0.8 : 0.99)) return;

      lastHauntAtRef.current = now;
      const hauntText = difficulty === "easy"
        ? "A cold breath brushes the back of your neck. The haveli listens."
        : difficulty === "medium"
          ? "Aabis scratches at the walls somewhere beyond the dark."
          : difficulty === "hard"
            ? "The house shifts. Doors groan shut behind you."
            : "No sound remains except the bride's breathing. The haveli hunts you now.";

      setNarrative(hauntText);
      setGlitchIntensity(difficulty === "easy" ? 0.2 : difficulty === "medium" ? 0.35 : difficulty === "hard" ? 0.5 : 0.7);
      setFearPulse(difficulty === "easy" ? 0.15 : difficulty === "medium" ? 0.25 : difficulty === "hard" ? 0.4 : 0.6);
      if (difficulty !== "easy") {
        setSanity(s => Math.max(0, s - (difficulty === "medium" ? 1 : difficulty === "hard" ? 2 : 3)));
      }
      if (difficulty === "impossible") {
        AudioEngine.whisper();
      } else {
        AudioEngine.heartbeat();
      }

      setTimeout(() => setGlitchIntensity(0), difficulty === "easy" ? 450 : 650);
      setTimeout(() => setFearPulse(0), 450);
      void config;
    }, 5000);

    return () => clearInterval(t);
  }, [gamePhase, difficulty]);

  // Ask Gemini for narration, returns choices
  const callGemini = useCallback(async (trigger: string, force = false) => {
    const now = Date.now();
    if (!force && now - lastGeminiCallAtRef.current < 3500) return;
    lastGeminiCallAtRef.current = now;
    try {
      const res = await fetch("/api/game", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          state: { sanity: sanityRef.current, currentZone: zoneRef.current, inventory, jinnDistance: 5 },
          action: trigger,
          context: "You are the narrator of 'Djinn-E-Qafas', a dark Pakistani horror myth. Use archaic, terrifying, and atmospheric language. Focus on the weight of the curse, the smell of old dust, and the spectral presence of Aabis, the Cursed Bride."
        }),
      });
      const data = await res.json();
      if (res.status === 429) { setNarrative("The ether churns... wait a moment."); return; }
      if (data.error) return;
      setNarrative(data.narrative);
      if (data.choices?.length) { setChoices(data.choices); setShowChoices(true); }
      setSanity(s => Math.max(0, Math.min(100, s + (data.sanity_delta || 0))));
      if (data.audio === "door_rattle")   AudioEngine.doorRattle();
      else if (data.audio === "whisper")  AudioEngine.whisper();
      else if (data.audio === "heartbeat") AudioEngine.heartbeat();
    } catch { /* silent */ }
  }, [inventory]);

  // Handle events from Three.js scene
  const handleEvent = useCallback((e: { type: string; payload?: { zone?: number; item?: string; intensity?: number; stage?: number; message?: string; eventId?: string } }) => {
    const payload = e.payload ?? {};
    switch (e.type) {
      case "zone_entered":
        setZone(payload.zone ?? 1);
        zoneRef.current = payload.zone ?? 1;
        callGemini(`Entered ${ZONE_NAMES[payload.zone ?? 1] ?? "deep tehkhana"} zone`);
        break;
      case "item_found":
        AudioEngine.footstep();
        setInventory(prev => {
          const next = [...prev, payload.item ?? "unknown_item"];
          if (next.length === REQUIRED_ITEMS) {
            setNarrative(`You have gathered all ${REQUIRED_ITEMS} sacred items. Return to the Tehkhana and step into the ritual circle. [E] TO BANISH AABIS.`);
          }
          return next;
        });
        callGemini(`Found a ${payload.item ?? "mysterious object"} on the floor`);
        break;
      case "near_item":
        if (payload.item === "__glitch__") {
          setGlitchIntensity(payload.intensity ?? 0);
        } else {
          setNearItem(payload.item ?? "");
        }
        break;
      case "fear_pulsed":
        setFearPulse(payload.intensity ?? 0);
        AudioEngine.heartbeat();
        AudioEngine.panicBreathing(payload.intensity ?? 0);
        AudioEngine.jinnGrowl(payload.intensity ?? 0);
        if ((payload.intensity ?? 0) > 0.88 && Math.random() < 0.2) {
          AudioEngine.playJinnLaugh(payload.intensity ?? 0.88);
        }
        AudioEngine.updateHorrorMusic(Math.max(0, Math.min(1, payload.intensity ?? 0)));
        // Reset pulse for animation
        setTimeout(() => setFearPulse(0), 400);
        break;
      case "light_failure":
        AudioEngine.lightFailureBuzz((payload.intensity ?? 0.35) * 0.35);
        setGlitchIntensity(Math.max(glitchIntensity, 0.35 + (payload.intensity ?? 0.2) * 0.4));
        setTimeout(() => setGlitchIntensity(0), 280);
        break;
      case "mini_event":
        if (payload.message) setNarrative(payload.message);
        if (payload.eventId === "door_chain") {
          AudioEngine.doorRattle();
          AudioEngine.lightFailureBuzz(0.12);
          AudioEngine.pakistaniHorrorMotif(0.4);
        } else if (payload.eventId === "echo_laugh") {
          AudioEngine.whisper();
          AudioEngine.playJinnLaugh(payload.intensity ?? 0.55);
          AudioEngine.horrorSting(0.16);
          AudioEngine.pakistaniHorrorMotif(0.28);
        } else {
          AudioEngine.panicBreathing(0.32);
          AudioEngine.pakistaniHorrorMotif(0.32);
        }
        break;
      case "cinematic_jumpscare":
        AudioEngine.playJinnLaugh(payload.intensity ?? 0.8);
        AudioEngine.horrorSting(payload.intensity ?? 0.8);
        AudioEngine.jumpScare();
        setFearPulse(Math.max(0.65, payload.intensity ?? 0.65));
        setTimeout(() => setFearPulse(0), 520);
        break;
      case "hiding_changed":
        // Handle hiding UI or state if needed
        break;
      case "tasbeeh_recited":
        setNarrative("You whisper tasbeeh beneath your breath. The air tightens, and Aabis recoils into the dark for a few moments.");
        AudioEngine.whisper();
        break;
      case "ritual_complete":
        if (payload.stage === 0) {
          setLocked(false); // Release mouse for cutscene camera control
          setNarrative("The sacred vessels burn. The Haveli's soul screams as Aabis is bound in the circle of rust...");
          callGemini("The ritual has begun. Aabis is crumbling into sacred ash.");
          AudioEngine.jumpScare();
        } else if (payload.stage === 1) {
          setGamePhase("won");
        }
        break;
      case "caught":
        AudioEngine.playPlayerScream(1);
        AudioEngine.playJinnLaugh(0.95);
        AudioEngine.jumpScare();
        setGamePhase("gameover");
        break;
    }
  }, [callGemini, glitchIntensity]);

  const sanityColor = sanity > 60 ? "#c8963e" : sanity > 30 ? "#e07020" : "#8b1a1a";

  // ── TITLE ────────────────────────────────────────────────────────
  if (!started) {
    return (
      <div ref={titleScrollRef} style={{ minHeight: "100dvh", width: "100%", background: "#000", fontFamily: "var(--font-cinzel)", position: "relative", overflowY: "auto", overflowX: "hidden", overscrollBehavior: "contain", WebkitOverflowScrolling: "touch", touchAction: "pan-y", padding: "clamp(24px, 7vh, 72px) 20px 48px" }}>
        <div style={{ position: "fixed", inset: 0, pointerEvents: "none", background: "radial-gradient(ellipse at 50% 60%, #1a0800 0%, #000 70%)" }} />
        <div style={{ position: "fixed", inset: 0, pointerEvents: "none", opacity: 0.06, backgroundImage: "repeating-linear-gradient(0deg, transparent, transparent 2px, #000 2px, #000 4px)" }} />
        <div style={{ position: "relative", zIndex: 1, textAlign: "center", maxWidth: "600px", margin: "0 auto", minHeight: "calc(100dvh - 72px)", display: "flex", flexDirection: "column", justifyContent: "center" }}>
          <p style={{ color: "#c8963e", fontSize: "11px", letterSpacing: "0.4em", marginBottom: "16px" }}>1987 — RURAL PUNJAB</p>
          <h1 style={{ color: "#f0e6d3", fontSize: "clamp(2.5rem, 8vw, 5rem)", fontWeight: 700, lineHeight: 1.1, letterSpacing: "0.12em", marginBottom: "8px", textShadow: "0 0 60px rgba(200,150,62,0.35)" }}>DJINN-E-QAFAS</h1>
          <p style={{ color: "#c8963e", fontSize: "clamp(1.2rem, 4vw, 1.75rem)", marginBottom: "20px", fontFamily: "var(--font-im-fell)" }}>جن قفس</p>
          <p style={{ color: "#555", fontSize: "clamp(0.85rem, 2.5vw, 1rem)", marginBottom: "16px", lineHeight: 1.8, fontFamily: "var(--font-im-fell)" }}>
            An abandoned haveli. Three rooms. One Jinn.<br />Find all {REQUIRED_ITEMS} sacred items to unlock the banishing ritual.
          </p>
          <div style={{ color: "#3a3a3a", fontSize: "11px", letterSpacing: "0.2em", marginBottom: "36px", lineHeight: 2 }}>
            WASD — walk &nbsp;·&nbsp; MOUSE — look &nbsp;·&nbsp; SHIFT — run &nbsp;·&nbsp; E — pick up
          </div>

          <div style={{
            margin: "0 auto 28px",
            maxWidth: "540px",
            padding: "16px 18px",
            border: "1px solid rgba(200,150,62,0.22)",
            background: "rgba(10,6,2,0.58)",
            boxShadow: "0 0 30px rgba(0,0,0,0.28)",
            color: "#b6a38a",
            textAlign: "left",
          }}>
            <div style={{ color: "#c8963e", fontSize: "10px", letterSpacing: "0.35em", marginBottom: "10px", textAlign: "center" }}>
              GAME MANUAL
            </div>
            <div style={{ fontFamily: "var(--font-im-fell)", fontSize: "0.95rem", lineHeight: 1.8 }}>
              <p style={{ margin: "0 0 8px" }}>1. Explore the haveli room by room and collect all 6 sacred items.</p>
              <p style={{ margin: "0 0 8px" }}>2. Keep moving, use SHIFT to run, and hide when the jinn gets too close.</p>
              <p style={{ margin: "0 0 8px" }}>3. When all items are found, go to the Tehkhana and stand inside the ritual circle.</p>
              <p style={{ margin: 0 }}>4. Press E to perform the ritual. If your sanity drops to zero, the Haveli claims you.</p>
            </div>
          </div>
          
          <div style={{ marginTop: "20px", marginBottom: "22px" }}>
            <div style={{ color: "#666", fontSize: "10px", letterSpacing: "0.35em", marginBottom: "10px" }}>SELECT DIFFICULTY</div>
            <div style={{ display: "flex", justifyContent: "center", gap: "8px", flexWrap: "wrap" }}>
              {(Object.keys(DIFFICULTY_CONFIG) as Difficulty[]).map((level) => {
                const active = difficulty === level;
                const config = DIFFICULTY_CONFIG[level];
                return (
                  <button
                    key={level}
                    onClick={() => setDifficulty(level)}
                    style={{
                      minWidth: "110px",
                      padding: "10px 14px",
                      border: `1px solid ${active ? "#c8963e" : "#333"}`,
                      background: active ? "rgba(200,150,62,0.16)" : "rgba(0,0,0,0.35)",
                      color: active ? "#f0e6d3" : "#666",
                      fontFamily: "var(--font-cinzel)",
                      fontSize: "12px",
                      letterSpacing: "0.18em",
                      cursor: "pointer",
                      boxShadow: active ? "0 0 18px rgba(200,150,62,0.15)" : "none",
                      transition: "all 0.25s ease",
                    }}
                    onMouseEnter={e => {
                      if (!active) e.currentTarget.style.borderColor = "#555";
                    }}
                    onMouseLeave={e => {
                      if (!active) e.currentTarget.style.borderColor = "#333";
                    }}
                  >
                    <div>{config.label}</div>
                    <div style={{ marginTop: "6px", fontSize: "8px", lineHeight: 1.4, letterSpacing: "0.12em", color: active ? "#f0e6d3" : "#777", maxWidth: "120px" }}>{config.hint}</div>
                  </button>
                );
              })}
            </div>
          </div>

          <div style={{ display: "flex", gap: "20px", justifyContent: "center", marginTop: "10px" }}>
            <button 
              onClick={() => { startedAtRef.current = Date.now(); sanityCollapseTriggeredRef.current = false; setSanity(DIFFICULTY_CONFIG[difficulty].startSanity); setStarted(true); setGamePhase("playing"); if (!AudioEngine.ctx) AudioEngine.init(); }}
              style={{ background: "#c8963e", color: "#000", border: "none", padding: "12px 32px", fontSize: "14px", fontFamily: "var(--font-cinzel)", cursor: "pointer", transition: "all 0.3s" }}
              onMouseEnter={e => (e.currentTarget.style.background = "#e0a04e")}
              onMouseLeave={e => (e.currentTarget.style.background = "#c8963e")}
            >
              ENTER THE HAVELI
            </button>
          </div>
          
          <p style={{ color: "#282828", fontSize: "10px", letterSpacing: "0.3em", marginTop: "24px" }}>USE HEADPHONES · PC ONLY</p>
        </div>
      </div>
    );
  }

  // ── END SCREENS ──────────────────────────────────────────────────
  if (gamePhase === "gameover" || gamePhase === "won") {
    const isLoss = gamePhase === "gameover";
    return (
      <div style={{ minHeight: "100dvh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "#000", fontFamily: "var(--font-cinzel)", padding: "20px", textAlign: "center", filter: isLoss ? "hue-rotate(310deg) brightness(0.8)" : "" }}>
        <div style={{ position: "absolute", inset: 0, background: isLoss ? "radial-gradient(ellipse at 50% 50%, #1a0000, #000)" : "radial-gradient(ellipse at 50% 50%, #0a0800, #000)" }} />
        <div style={{ position: "relative", zIndex: 1 }}>
          <h1 style={{ fontSize: "clamp(3rem, 10vw, 5rem)", color: isLoss ? "#8b1a1a" : "#c8963e", textShadow: isLoss ? "0 0 80px rgba(139,26,26,0.8)" : "0 0 80px rgba(200,150,62,0.6)", marginBottom: "20px" }}>
            {isLoss ? "POSSESSED" : "FREED"}
          </h1>
          {isLoss && <p style={{ color: "#555", marginBottom: "16px", fontFamily: "var(--font-im-fell)", fontSize: "1.1rem" }}>وہ اندر آ گیا۔ تم نہیں بچے۔</p>}
          <p style={{ color: "#666", marginBottom: "6px" }}>Sanity: <span style={{ color: sanityColor }}>{sanity}%</span></p>
          <p style={{ color: "#666", marginBottom: "32px" }}>Items found: <span style={{ color: "#c8963e" }}>{inventory.join(", ") || "none"}</span></p>
          <button onClick={() => { AudioEngine.stopEndingScreenAudio(); startedAtRef.current = null; sanityCollapseTriggeredRef.current = false; setSanity(100); setInventory([]); setZone(1); setGamePhase("title"); setStarted(false); }}
            style={{ padding: "12px 32px", border: "1px solid #333", color: "#555", background: "transparent", fontSize: "12px", letterSpacing: "0.3em", cursor: "pointer", fontFamily: "var(--font-cinzel)", textTransform: "uppercase" }}>
            Try Again
          </button>
        </div>
      </div>
    );
  }

  // ── MAIN GAME ─────────────────────────────────────────────────────
  return (
    <div style={{ position: "relative", width: "100vw", height: "100vh", background: "#000", overflow: "hidden", cursor: locked ? "none" : "default" }}>
      
      {/* Spectral Glitch Overlay */}
      {glitchIntensity > 0 && (
        <div style={{ 
          position: "absolute", inset: 0, zIndex: 10, pointerEvents: "none",
          backdropFilter: `hue-rotate(${glitchIntensity * 90}deg) contrast(${1 + glitchIntensity * 0.5}) brightness(${1 - glitchIntensity * 0.3})`,
          background: `rgba(255,0,0,${glitchIntensity * 0.1})`,
          opacity: 0.45 + glitchIntensity * 0.25
        }} />
      )}

      {/* Film Grain & Grit Layer */}
      <div style={{
        position: "absolute", inset: 0, zIndex: 7, pointerEvents: "none",
        opacity: 0.12,
        backgroundImage: `url("https://www.transparenttextures.com/patterns/stardust.png")`, // Grain pattern
        mixBlendMode: "overlay"
      }} />
      <div style={{
        position: "absolute", inset: 0, zIndex: 8, pointerEvents: "none",
        opacity: 0.08,
        backgroundImage: `url("https://www.transparenttextures.com/patterns/asfalt-dark.png")`, // Lens dirt/grit
        mixBlendMode: "multiply"
      }} />

      {/* Banishment Flash Overlay */}
      <div style={{
        position: "absolute", inset: 0, zIndex: 10, pointerEvents: "none",
        backgroundColor: "#fff",
        opacity: fearPulse > 0.8 && inventory.length === 7 ? 1 : 0,
        transition: "opacity 0.1s ease-in-out"
      }} />

      {/* Cursed Atmospheric Filter & Chromatic Aberration */}
      <div style={{
        position: "absolute", inset: 0, zIndex: 5, pointerEvents: "none",
        backdropFilter: `
          grayscale(${inventory.length * 12}%) 
          contrast(${1 + inventory.length * 0.08}) 
          brightness(${1 - inventory.length * 0.05})
          sepia(${inventory.length * 5}%)
        `,
        filter: `drop-shadow(2px 0px 0px rgba(255,0,0,${0.2 * inventory.length / 7})) drop-shadow(-2px 0px 0px rgba(0,0,255,${0.2 * inventory.length / 7}))`,
        transition: "backdrop-filter 2s ease, filter 0.5s ease"
      }} />

      {/* Panic Vignette (Red Pulse) */}
      <div style={{
        position: "absolute", inset: 0, zIndex: 6, pointerEvents: "none",
        background: `radial-gradient(circle, transparent 40%, rgba(139, 26, 26, ${fearPulse * 0.5}) 100%)`,
        opacity: fearPulse > 0.1 ? 1 : 0,
        transition: "opacity 0.2s ease-out"
      }} />

      {/* Full-screen 3D scene */}
      <HaveliScene
        zoneRef={zoneRef}
        sanityRef={sanityRef}
        onEvent={handleEvent}
        onLockChange={setLocked}
        isCursed={difficulty === "hard" || difficulty === "impossible"}
        difficulty={difficulty}
      />

      {/* Click-to-lock prompt */}
      {!locked && (
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, pointerEvents: "none" }}>
          <div style={{ background: "rgba(0,0,0,0.75)", border: "1px solid rgba(200,150,62,0.3)", padding: "16px 28px", fontFamily: "var(--font-cinzel)", color: "#c8963e", fontSize: "12px", letterSpacing: "0.3em", textTransform: "uppercase" }}>
            Click to Look Around
          </div>
        </div>
      )}

      {/* HUD — top strip */}
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, zIndex: 40, display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 16px", background: "linear-gradient(rgba(0,0,0,0.8), transparent)", fontFamily: "var(--font-cinzel)", pointerEvents: "none" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <span style={{ fontSize: "10px", letterSpacing: "0.25em", color: sanityColor }}>SANITY</span>
          <div style={{ width: "80px", height: "3px", background: "#1a1a1a", borderRadius: "2px", overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${sanity}%`, background: sanityColor, transition: "width 0.5s", boxShadow: `0 0 6px ${sanityColor}` }} />
          </div>
          <span style={{ fontSize: "10px", color: sanityColor }}>{sanity}%</span>
        </div>
        <span style={{ fontSize: "10px", letterSpacing: "0.15em", color: inventory.length ? "#c8963e" : "#2a2a2a" }}>
          {ZONE_NAMES[zone] ?? "DEEP TEHKHANA"}
        </span>
        <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
          <span style={{ fontSize: "10px", letterSpacing: "0.2em", color: "#666" }}>SACRED ITEMS</span>
          <div style={{ display: "flex", gap: "5px" }}>
            {[1,2,3,4,5,6].map(i => (
              <div key={i} style={{ width: "14px", height: "14px", border: "1px solid #3a3a3a", background: inventory.length >= i ? "#c8963e" : "transparent", boxShadow: inventory.length >= i ? "0 0 8px #c8963e" : "none", transition: "all 0.4s" }} />
            ))}
          </div>
        </div>
      </div>

      {locked && inventory.length === REQUIRED_ITEMS && (
        <div style={{ position: "absolute", top: "48px", left: "50%", transform: "translateX(-50%)", zIndex: 40, pointerEvents: "none" }}>
          <div style={{ background: "rgba(0,0,0,0.55)", border: "1px solid rgba(200,150,62,0.28)", color: "#9adf9a", fontFamily: "var(--font-cinzel)", fontSize: "10px", letterSpacing: "0.2em", padding: "6px 10px" }}>
            RITUAL WINDOW OPEN — RETURN TO TEHKHANA
          </div>
        </div>
      )}

      {/* Hiding Indicator */}
      {locked && (
        <div style={{ position: "absolute", bottom: "100px", left: "20px", zIndex: 40, pointerEvents: "none" }}>
          {nearItem === "__hide__" && <div style={{ color: "#c8963e", fontSize: "10px", letterSpacing: "0.2em", background: "rgba(0,0,0,0.5)", padding: "4px 8px" }}>NEAR HIDING SPOT [H]</div>}
          {nearItem === "__unhide__" && (
            <div style={{ color: "#8b1a1a", fontSize: "10px", letterSpacing: "0.2em", background: "rgba(0,0,0,0.5)", padding: "4px 8px" }}>
              {hasTasbeeh ? "HIDING [H TO EXIT · T TO RECITE TASBEEH]" : "HIDING [H TO EXIT]"}
            </div>
          )}
        </div>
      )}

      {nearItem && locked && nearItem !== "__hide__" && nearItem !== "__unhide__" && (
        <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, calc(-50% + 60px))", zIndex: 40, pointerEvents: "none", textAlign: "center" }}>
          <div style={{ border: "1px solid rgba(200,150,62,0.4)", padding: "10px 20px", background: "rgba(0,0,0,0.75)", fontFamily: "var(--font-cinzel)", color: nearItem === "__ritual__" ? "#ffddaa" : "#c8963e", fontSize: "11px", letterSpacing: "0.3em", animation: "breathe 2s infinite" }}>
            {nearItem === "__ritual__"
              ? `[E] PERFORM RITUAL — PLACE ALL ${REQUIRED_ITEMS} ITEMS`
              : `[E] PICK UP ${nearItem.toUpperCase().replace("_", " ")}`}
          </div>
        </div>
      )}

      {/* Crosshair */}
      {locked && (
        <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)", zIndex: 40, pointerEvents: "none", display: "flex", alignItems: "center", justifyContent: "center" }}>
          {/* Inner Dot */}
          <div style={{ width: "3px", height: "3px", background: "#c8963e", borderRadius: "50%", boxShadow: "0 0 8px #c8963e" }} />
          {/* Outer Diamond Frame */}
          <svg width="24" height="24" viewBox="0 0 24 24" style={{ position: "absolute", opacity: 0.6 }}>
            <path d="M12 4 L14 12 L12 20 L10 12 Z" fill="none" stroke="#c8963e" strokeWidth="0.5" />
            <path d="M4 12 L12 14 L20 12 L12 10 Z" fill="none" stroke="#c8963e" strokeWidth="0.5" />
          </svg>
          {/* subtle circle ring */}
          <div style={{ position: "absolute", width: "16px", height: "16px", border: "0.5px solid rgba(200,150,62,0.2)", borderRadius: "50%" }} />
        </div>
      )}

      {/* Narrative box — bottom */}
      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, zIndex: 40, padding: "14px 20px", background: "linear-gradient(transparent, rgba(0,0,0,0.95) 30%)", minHeight: showChoices ? "auto" : "80px" }}>
        <p style={{ fontFamily: "var(--font-im-fell)", fontSize: "clamp(0.78rem, 1.6vw, 0.95rem)", color: "#d4c4a8", textAlign: "center", lineHeight: 1.7, maxWidth: "700px", margin: "0 auto 10px" }}>
          {narrative}
        </p>

        {/* Optional choice buttons after Gemini responds */}
        {showChoices && (
          <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: "8px", marginBottom: "8px" }}>
            {choices.map((c, i) => (
              <button key={i} onClick={() => { setShowChoices(false); callGemini(c, true); }}
                style={{ padding: "6px 14px", border: "1px solid rgba(200,150,62,0.25)", color: "#a07830", background: "rgba(0,0,0,0.6)", fontSize: "10px", letterSpacing: "0.2em", cursor: "pointer", fontFamily: "var(--font-cinzel)", textTransform: "uppercase", transition: "all 0.2s" }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = "rgba(200,150,62,0.7)"; e.currentTarget.style.color = "#c8963e"; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = "rgba(200,150,62,0.25)"; e.currentTarget.style.color = "#a07830"; }}>
                {c}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
