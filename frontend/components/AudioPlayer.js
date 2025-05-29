import { useEffect, useRef, useState } from 'react';
import { audioEvents } from './VoiceChat';

export default function AudioPlayer({ audioData, mimeType = 'audio/wav' }) {
  const audioRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);
  
  // Auto-play when audio data is received
  useEffect(() => {
    if (audioRef.current && audioData) {
      console.log("[AudioPlayer] New audio received, attempting autoplay");
      
      // Explicitly set loop to false to ensure it doesn't loop
      audioRef.current.loop = false;
      
      // Create a promise to attempt autoplay
      const playPromise = audioRef.current.play();
      
      // Handle autoplay restrictions
      if (playPromise !== undefined) {
        playPromise
          .then(() => {
            console.log("[AudioPlayer] Autoplay started successfully");
            setIsPlaying(true);
            audioEvents.publish('audio-play-start');
          })
          .catch(error => {
            console.warn("[AudioPlayer] Autoplay prevented:", error);
            // Autoplay was prevented - the user will need to press play manually
          });
      }
    }
  }, [audioData]);
  
  // Set up event listeners for the audio element
  useEffect(() => {
    const audioElement = audioRef.current;
    
    if (!audioElement) return;
    
    // Event handlers
    const handlePlay = () => {
      console.log("[AudioPlayer] Playback started");
      setIsPlaying(true);
      audioEvents.publish('audio-play-start');
    };
    
    const handlePause = () => {
      console.log("[AudioPlayer] Playback paused");
      setIsPlaying(false);
      if (audioElement.currentTime >= audioElement.duration - 0.5) {
        // If paused near the end, treat as ended
        audioEvents.publish('audio-play-end');
      }
    };
    
    const handleEnded = () => {
      console.log("[AudioPlayer] Playback ended");
      setIsPlaying(false);
      // Ensure we reset to the beginning
      audioElement.currentTime = 0;
      audioEvents.publish('audio-play-end');
    };
    
    const handleError = (e) => {
      console.error("[AudioPlayer] Playback error:", e);
      setIsPlaying(false);
      audioEvents.publish('audio-play-end');
    };
    
    // Add event listeners
    audioElement.addEventListener("play", handlePlay);
    audioElement.addEventListener("pause", handlePause);
    audioElement.addEventListener("ended", handleEnded);
    audioElement.addEventListener("error", handleError);
    
    // Clean up event listeners on unmount
    return () => {
      audioElement.removeEventListener("play", handlePlay);
      audioElement.removeEventListener("pause", handlePause);
      audioElement.removeEventListener("ended", handleEnded);
      audioElement.removeEventListener("error", handleError);
    };
  }, []);
  
  return (
    <div className="custom-audio-player">
      <audio
        ref={audioRef}
        controls
        src={`data:${mimeType};base64,${audioData}`}
        className="message-audio-player"
        loop={false}
        preload="auto"
      />
      {isPlaying && (
        <div className="playing-indicator">
          🔊 Playing...
        </div>
      )}
    </div>
  );
} 