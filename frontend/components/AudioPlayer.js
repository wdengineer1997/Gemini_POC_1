import { useEffect, useRef } from 'react';
import { audioEvents } from './VoiceChat';

export default function AudioPlayer({ audioData, mimeType = 'audio/wav' }) {
  const audioRef = useRef(null);

  useEffect(() => {
    if (!audioData) return;
    
    // Create audio source
    const audioBlob = new Blob(
      [Uint8Array.from(atob(audioData), c => c.charCodeAt(0))], 
      { type: mimeType }
    );
    const audioUrl = URL.createObjectURL(audioBlob);
    
    if (audioRef.current) {
      audioRef.current.src = audioUrl;
      
      // Try to autoplay the audio
      const playPromise = audioRef.current.play();
      
      // Handle autoplay restrictions
      if (playPromise !== undefined) {
        playPromise
          .then(() => {
            console.log("Audio autoplay started successfully");
            // Make the TalkingHead speak when audio plays
            if (typeof window !== 'undefined' && typeof window.speakWithAudio === 'function') {
              window.speakWithAudio(audioData);
            }
          })
          .catch(error => {
            console.warn("Audio autoplay prevented:", error);
            // Autoplay was prevented - user will need to press play manually
          });
      }
      
      // Make the TalkingHead speak when audio plays manually
      audioRef.current.onplay = () => {
        if (typeof window !== 'undefined' && typeof window.speakWithAudio === 'function') {
          window.speakWithAudio(audioData);
        }
      };
      
      // Clean up when component unmounts
      return () => {
        URL.revokeObjectURL(audioUrl);
      };
    }
  }, [audioData, mimeType]);

  return (
    <audio 
      ref={audioRef} 
      controls 
      className="message-audio-player"
      preload="auto"
    />
  );
} 