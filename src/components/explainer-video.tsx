"use client";

// The "Working with Fixfy" explainer without the browser's controls: no timer,
// no scrubber, so nobody sees "2:26" and gives up. Just a thick progress bar
// that runs as if the video were ~20 seconds at first and slows towards the
// end (log curve), tap to pause, and a button for sound (autoplay is muted).

import { useEffect, useRef, useState } from "react";
import { T } from "@/lib/tokens";
import { Icon } from "@/components/ui/primitives";

/** Bigger = faster start and slower end. 24 on a 2:26 video ≈ the pace of a 20 s one at the start. */
const CURVE = 24;
const shownProgress = (x: number) => Math.log1p(CURVE * Math.min(1, Math.max(0, x))) / Math.log1p(CURVE);

/** `width` is any CSS width (the frame follows `ratio`, the bar sits under it at the same width). */
export function ExplainerVideo({ src, poster, width, ratio }: { src: string; poster: string; width: string; ratio: string }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const barRef = useRef<HTMLDivElement | null>(null);
  const [muted, setMuted] = useState(true);
  const [paused, setPaused] = useState(false);
  const [ended, setEnded] = useState(false);

  // Starts playing by itself; if the browser blocked that, show the play button.
  useEffect(() => {
    const t = setTimeout(() => {
      if (videoRef.current?.paused) setPaused(true);
    }, 1500);
    return () => clearTimeout(t);
  }, [src]);

  // Read currentTime every frame while playing: smoother than timeupdate (~4/s).
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const v = videoRef.current;
      if (v && barRef.current && v.duration > 0) {
        barRef.current.style.width = `${shownProgress(v.currentTime / v.duration) * 100}%`;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [src]);

  const play = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.ended) v.currentTime = 0;
    void v.play().catch(() => {});
  };

  const toggle = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused || v.ended) play();
    else v.pause();
  };

  const toggleSound = () => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = !v.muted;
    setMuted(v.muted);
    if (!v.muted && (v.paused || v.ended)) play();
  };

  return (
    <div style={{ width, display: "flex", flexDirection: "column", gap: 10, flexShrink: 0 }}>
      <div style={{ position: "relative", width: "100%", aspectRatio: ratio, borderRadius: 12, overflow: "hidden", background: T.navy }}>
        <video
          key={src}
          ref={videoRef}
          src={src}
          poster={poster}
          autoPlay
          muted
          playsInline
          disablePictureInPicture
          preload="metadata"
          onClick={toggle}
          onPlay={() => {
            setPaused(false);
            setEnded(false);
          }}
          onPause={() => setPaused(true)}
          onEnded={() => {
            setPaused(true);
            setEnded(true);
          }}
          style={{ width: "100%", height: "100%", display: "block", objectFit: "cover", cursor: "pointer" }}
        />

        <button
          type="button"
          onClick={toggleSound}
          aria-label={muted ? "Turn sound on" : "Turn sound off"}
          style={{
            position: "absolute",
            top: 10,
            right: 10,
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: muted ? "7px 12px" : 8,
            borderRadius: 9999,
            border: "none",
            background: muted ? T.coral : "rgba(2,0,64,0.55)",
            color: T.white,
            fontFamily: T.sans,
            fontSize: 13,
            fontWeight: 600,
            cursor: "pointer",
            boxShadow: "0 6px 18px -6px rgba(0,0,0,0.5)",
          }}
        >
          <Icon name={muted ? "volume-x" : "volume-2"} size={16} />
          {muted ? "Tap for sound" : null}
        </button>

        {paused && (
          <button
            type="button"
            onClick={play}
            aria-label={ended ? "Watch again" : "Play"}
            style={{
              position: "absolute",
              inset: 0,
              margin: "auto",
              width: ended ? "auto" : 68,
              height: 68,
              padding: ended ? "0 22px" : 0,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              borderRadius: 9999,
              border: "none",
              background: T.coral,
              boxShadow: "0 10px 30px -8px rgba(0,0,0,0.6)",
              color: T.white,
              fontFamily: T.sans,
              fontSize: 15,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            <Icon name={ended ? "rotate-ccw" : "play"} size={ended ? 18 : 28} />
            {ended ? "Watch again" : null}
          </button>
        )}
      </div>

      <div style={{ height: 8, borderRadius: 9999, background: T.paper2, overflow: "hidden" }}>
        <div ref={barRef} style={{ width: "0%", height: "100%", borderRadius: 9999, background: T.coral }} />
      </div>
    </div>
  );
}
