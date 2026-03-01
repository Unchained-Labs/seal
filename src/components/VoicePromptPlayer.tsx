import { useMemo, useRef, useState } from "react";

interface VoicePromptPlayerProps {
  src: string;
}

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) {
    return "00:00";
  }
  const total = Math.floor(seconds);
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

export function VoicePromptPlayer({ src }: VoicePromptPlayerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const progress = useMemo(() => {
    if (!duration) {
      return 0;
    }
    return (currentTime / duration) * 100;
  }, [currentTime, duration]);

  const togglePlay = async () => {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }
    if (audio.paused) {
      await audio.play();
      setIsPlaying(true);
    } else {
      audio.pause();
      setIsPlaying(false);
    }
  };

  return (
    <div className="voice-player">
      <audio
        ref={audioRef}
        src={src}
        onLoadedMetadata={(event) => {
          setDuration(event.currentTarget.duration || 0);
        }}
        onTimeUpdate={(event) => {
          setCurrentTime(event.currentTarget.currentTime || 0);
        }}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={() => setIsPlaying(false)}
      />
      <button className="voice-player__toggle" type="button" onClick={() => void togglePlay()}>
        {isPlaying ? "Pause" : "Play"}
      </button>
      <div className="voice-player__timeline">
        <div className="voice-player__progress" style={{ width: `${progress}%` }} />
      </div>
      <input
        className="voice-player__scrubber"
        type="range"
        min={0}
        max={duration || 0}
        step={0.1}
        value={Math.min(currentTime, duration || 0)}
        onChange={(event) => {
          const audio = audioRef.current;
          if (!audio) {
            return;
          }
          const nextTime = Number(event.target.value);
          audio.currentTime = nextTime;
          setCurrentTime(nextTime);
        }}
      />
      <p className="voice-player__time">
        {formatTime(currentTime)} / {formatTime(duration)}
      </p>
    </div>
  );
}
