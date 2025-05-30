// Plain JavaScript version of TalkingHead

// Function to initialize TalkingHead
async function initTalkingHead() {
  console.log('Initializing TalkingHead...');
  const container = document.getElementById('talking-head');
  if (!container) {
    console.error('Container element not found');
    return;
  }
  console.log('Found container element:', container);
  
  try {
    // Import the TalkingHead module
    console.log('Importing TalkingHead module...');
    const TalkingHeadModule = await import('./talkinghead/modules/talkinghead.mjs');
    console.log('TalkingHead module imported:', TalkingHeadModule);
    const { TalkingHead } = TalkingHeadModule;
    
    // Create the talking head instance
    console.log('Creating TalkingHead instance...');
    const head = new TalkingHead(container, {
      cameraView: "upper", // Use upper body view for better visibility
      avatarMood: "neutral",
      modelFPS: 30,
      avatarIdleEyeContact: 0.3,
      avatarIdleHeadMove: 0.5,
      avatarSpeakingEyeContact: 0.7,
      avatarSpeakingHeadMove: 0.6,
    });
    
    // Load and show the avatar
    console.log('Loading avatar from URL:', '/talkinghead/avatars/brunette.glb');
    await head.showAvatar({
      url: '/talkinghead/avatars/brunette.glb',
      body: 'F',
      avatarMood: 'neutral',
    });
    
    console.log('TalkingHead avatar loaded successfully');
    
    // Function to make the avatar speak with the provided audio data
    window.speakWithAudio = async (audioData) => {
      if (!head) {
        console.error('TalkingHead not initialized');
        return;
      }
      
      try {
        console.log('Converting audio data for speech...');
        // Convert base64 audio to ArrayBuffer
        const binaryString = window.atob(audioData);
        const len = binaryString.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        
        // Speak the audio with lip sync
        console.log('Making avatar speak...');
        await head.speakAudio(bytes.buffer);
        console.log('Speech completed');
      } catch (error) {
        console.error('Error making avatar speak:', error);
      }
    };
  } catch (error) {
    console.error('Error initializing TalkingHead:', error);
    console.error('Error details:', error.message, error.stack);
  }
}

// Initialize when the DOM is fully loaded
console.log('Setting up TalkingHead initialization...');
document.addEventListener('DOMContentLoaded', initTalkingHead); 