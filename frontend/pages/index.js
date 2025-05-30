import { useState, useRef, useEffect } from "react";
import { io } from "socket.io-client";
import VoiceChat from "../components/VoiceChat";
import AudioPlayer from "../components/AudioPlayer";
import Head from 'next/head';
import TalkingHead from "../components/TalkingHead";

export default function Home() {
  const [systemInstr, setSystemInstr] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [showApiKey, setShowApiKey] = useState(false);
  const [socketStatus, setSocketStatus] = useState("disconnected");
  const socketRef = useRef(null);
  const chatContainerRef = useRef(null);
  const [messages, setMessages] = useState([]);

  // Connect to socket on component mount
  useEffect(() => {
    if (typeof window === "undefined") return; // SSR guard

    setSocketStatus("connecting");
    const socket = io(process.env.NEXT_PUBLIC_API_WS || "http://localhost:5000");
    socketRef.current = socket;

    socket.on("connect", () => {
      console.log("[Frontend] Socket connected");
      setSocketStatus("connected");
    });

    socket.on("disconnect", () => {
      console.log("[Frontend] Socket disconnected");
      setSocketStatus("disconnected");
    });

    socket.on("connect_error", (err) => {
      console.error("[Frontend] Socket connection error:", err);
      setSocketStatus("disconnected");
    });

    return () => {
      socket?.disconnect();
    };
  }, []);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [messages]);

  // Format timestamp for messages
  const formatTime = (date) => {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  // Handle new message
  const handleNewMessage = (text, sender, audioData = null, mimeType = null, isUpdate = false) => {
    setMessages((prev) => {
      // If this is an update to the last message from the same sender
      if (isUpdate && prev.length > 0 && prev[prev.length - 1].sender === sender) {
        const newMessages = [...prev];
        newMessages[newMessages.length - 1] = {
          ...newMessages[newMessages.length - 1],
          text,
          ...(audioData && { audioData, mimeType })
        };
        return newMessages;
      }
      
      // Otherwise add as a new message
      return [...prev, {
        sender,
        text,
        timestamp: new Date(),
        audioData,
        mimeType
      }];
    });
  };

  useEffect(() => {
    // Import Three.js dynamically on the client side
    const loadThreeJS = async () => {
      // Only run in the browser
      if (typeof window !== 'undefined') {
        try {
          // Load Three.js and related libraries
          const THREE = await import('three');
          const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
          const { OrbitControls } = await import('three/examples/jsm/controls/OrbitControls.js');
          
          // Initialize the TalkingHead
          initTalkingHead(THREE, GLTFLoader, OrbitControls);
        } catch (error) {
          console.error('Error loading Three.js:', error);
        }
      }
    };
    
    loadThreeJS();
  }, []);
  
  // Function to initialize the TalkingHead
  const initTalkingHead = (THREE, GLTFLoader, OrbitControls) => {
    console.log('Initializing TalkingHead...');
    
    const container = document.getElementById('talking-head');
    if (!container) {
      console.error('Container element not found');
      return;
    }
    
    // Basic Three.js setup
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf5f5f5);
    
    // Camera setup
    const camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.1, 1000);
    camera.position.set(0, 1.5, 2.0);
    camera.lookAt(0, 1.5, 0);
    
    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    container.appendChild(renderer.domElement);
    
    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 1);
    scene.add(ambientLight);
    
    const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
    directionalLight.position.set(0, 1, 1);
    scene.add(directionalLight);
    
    // Load 3D model - use Next.js public path
    const loader = new GLTFLoader();
    console.log('Loading avatar model...');
    
    loader.load(
      '/talkinghead/avatars/brunette.glb',
      (gltf) => {
        console.log('Model loaded successfully!');
        const model = gltf.scene;
        scene.add(model);
        
        // Center model and adjust scale if needed
        const box = new THREE.Box3().setFromObject(model);
        const center = box.getCenter(new THREE.Vector3());
        model.position.x = -center.x;
        model.position.y = -center.y;
        model.position.z = -center.z;
        
        // Animation mixer for any animations
        if (gltf.animations && gltf.animations.length > 0) {
          const mixer = new THREE.AnimationMixer(model);
          const clip = gltf.animations[0];
          const action = mixer.clipAction(clip);
          action.play();
          
          // Update animations in render loop
          const clock = new THREE.Clock();
          function animate() {
            requestAnimationFrame(animate);
            const delta = clock.getDelta();
            mixer.update(delta);
            renderer.render(scene, camera);
          }
          
          animate();
        } else {
          // Simple render loop if no animations
          function animate() {
            requestAnimationFrame(animate);
            renderer.render(scene, camera);
          }
          
          animate();
        }
        
        // Simple speaking animation function
        window.speakWithAudio = (audioData) => {
          console.log('Speaking with audio data, length:', audioData.length);
          // In a real implementation, this would analyze the audio and animate the face
        };
      },
      (progress) => {
        const percent = (progress.loaded / progress.total) * 100;
        console.log(`Loading model: ${percent.toFixed(2)}%`);
      },
      (error) => {
        console.error('Error loading model:', error);
      }
    );
    
    // Handle window resize
    window.addEventListener('resize', () => {
      camera.aspect = container.clientWidth / container.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(container.clientWidth, container.clientHeight);
    });
  };

  return (
    <div>
      <Head>
        <title>Gemini Voice Chat</title>
        <meta name="description" content="Gemini Voice Chat with 3D Avatar" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
      </Head>
      
      <main className="video-chat-app">
        <div className="app-container">
          <div className="app-header">
            <h1 className="app-title">
              <span className="app-logo">🤖</span> Gemini Video Call
              <span className={`connection-badge ${socketStatus}`}>
                {socketStatus === "connected" ? "Online" : 
                 socketStatus === "connecting" ? "Connecting..." : 
                 "Offline"}
              </span>
            </h1>
          </div>

          <div className="video-chat-layout">
            <div className="video-chat-main">
              {/* 3D Talking Head Component */}
              <TalkingHead />
              
              {/* Voice Controls */}
              <VoiceChat
                socket={socketRef}
                socketStatus={socketStatus}
                systemInstructions={systemInstr}
                apiKey={apiKey}
                onNewMessage={handleNewMessage}
              />
            </div>
            
            <div className="video-chat-sidebar">
              {/* System Instructions Panel */}
              <div className="sidebar-panel">
                <h3 className="panel-header">
                  <span className="panel-icon">⚙️</span> System Instructions
                </h3>
                <textarea
                  className="system-textarea"
                  placeholder="Enter optional system instructions (e.g. 'You are a friendly assistant who speaks like a pirate')"
                  value={systemInstr}
                  onChange={(e) => setSystemInstr(e.target.value)}
                  rows={3}
                />
              </div>

              {/* API Key Panel */}
              <div className="sidebar-panel">
                <h3 className="panel-header">
                  <span className="panel-icon">🔑</span> API Key
                </h3>
                <div className="api-key-input-group">
                  <input
                    type={showApiKey ? "text" : "password"}
                    className="api-key-input"
                    placeholder="Enter your Gemini API key"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                  />
                  <button 
                    className="toggle-visibility-button"
                    onClick={() => setShowApiKey(!showApiKey)}
                  >
                    {showApiKey ? "🙈" : "👁️"}
                  </button>
                </div>
              </div>
              
              {/* Conversation History */}
              <div className="sidebar-panel conversation-panel">
                <h3 className="panel-header">
                  <span className="panel-icon">💬</span> Conversation
                </h3>
                <div className="messages-container" ref={chatContainerRef}>
                  {messages.length === 0 ? (
                    <div className="empty-state">
                      <p>Start a conversation by clicking the call button</p>
                    </div>
                  ) : (
                    messages.map((message, index) => (
                      <div 
                        key={index} 
                        className={`message ${message.sender}`}
                      >
                        <div className="message-content">
                          <div className="message-header">
                            <span className="message-sender">
                              {message.sender === "user" ? "You" : "Gemini"}
                            </span>
                            <span className="message-time">
                              {formatTime(message.timestamp)}
                            </span>
                          </div>
                          <div className="message-text">{message.text}</div>
                          {message.audioData && (
                            <AudioPlayer 
                              audioData={message.audioData} 
                              mimeType={message.mimeType} 
                            />
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      <style jsx global>{`
        * {
          box-sizing: border-box;
          margin: 0;
          padding: 0;
        }
        
        body {
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
          background-color: #f0f2f5;
          color: #333;
        }
        
        .video-chat-app {
          min-height: 100vh;
          padding: 20px;
          display: flex;
          justify-content: center;
          align-items: center;
          background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%);
        }
        
        .app-container {
          width: 100%;
          max-width: 1200px;
          background: white;
          border-radius: 16px;
          box-shadow: 0 10px 30px rgba(0, 0, 0, 0.1);
          overflow: hidden;
        }
        
        .app-header {
          padding: 16px 24px;
          background: #1e1e1e;
          color: white;
          display: flex;
          justify-content: space-between;
          align-items: center;
          border-bottom: 1px solid #333;
        }
        
        .app-title {
          font-size: 20px;
          font-weight: 600;
          display: flex;
          align-items: center;
          gap: 8px;
        }
        
        .app-logo {
          font-size: 24px;
        }
        
        .connection-badge {
          font-size: 12px;
          padding: 4px 8px;
          border-radius: 12px;
          margin-left: 12px;
        }
        
        .connection-badge.connected {
          background: #34c759;
        }
        
        .connection-badge.connecting {
          background: #ff9500;
        }
        
        .connection-badge.disconnected {
          background: #ff3b30;
        }
        
        .video-chat-layout {
          display: flex;
          min-height: 80vh;
        }
        
        .video-chat-main {
          flex: 1;
          padding: 20px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          background: #f9f9f9;
        }
        
        .video-chat-sidebar {
          width: 340px;
          padding: 20px;
          display: flex;
          flex-direction: column;
          gap: 16px;
          background: white;
          border-left: 1px solid #eaeaea;
          overflow-y: auto;
        }
        
        .sidebar-panel {
          background: #f9f9f9;
          border-radius: 12px;
          padding: 16px;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
        }
        
        .panel-header {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 16px;
          font-weight: 600;
          margin-bottom: 12px;
          color: #333;
        }
        
        .panel-icon {
          font-size: 18px;
        }
        
        .system-textarea {
          width: 100%;
          padding: 12px;
          border-radius: 8px;
          border: 1px solid #ddd;
          font-family: inherit;
          resize: none;
          font-size: 14px;
        }
        
        .system-textarea:focus {
          outline: none;
          border-color: #007aff;
        }
        
        .api-key-input-group {
          display: flex;
          gap: 8px;
        }
        
        .api-key-input {
          flex: 1;
          padding: 12px;
          border-radius: 8px;
          border: 1px solid #ddd;
          font-family: inherit;
        }
        
        .api-key-input:focus {
          outline: none;
          border-color: #007aff;
        }
        
        .toggle-visibility-button {
          width: 40px;
          background: #f0f0f0;
          border: 1px solid #ddd;
          border-radius: 8px;
          cursor: pointer;
        }
        
        .toggle-visibility-button:hover {
          background: #e5e5e5;
        }
        
        .conversation-panel {
          flex: 1;
          display: flex;
          flex-direction: column;
          max-height: 400px;
        }
        
        .messages-container {
          flex: 1;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
          gap: 12px;
          padding-right: 4px;
        }
        
        .empty-state {
          height: 100%;
          display: flex;
          justify-content: center;
          align-items: center;
          color: #999;
          text-align: center;
          font-size: 14px;
          padding: 20px;
        }
        
        .message {
          padding: 12px;
          border-radius: 12px;
          max-width: 100%;
        }
        
        .message.user {
          align-self: flex-end;
          background: #e1f5fe;
        }
        
        .message.assistant {
          align-self: flex-start;
          background: #f0f0f0;
        }
        
        .message-header {
          display: flex;
          justify-content: space-between;
          margin-bottom: 4px;
          font-size: 12px;
        }
        
        .message-sender {
          font-weight: 600;
        }
        
        .message-time {
          color: #777;
        }
        
        .message-text {
          font-size: 14px;
          line-height: 1.4;
          margin-bottom: 8px;
        }
        
        .message-audio-player {
          width: 100%;
          height: 36px;
          border-radius: 8px;
        }
      `}</style>
    </div>
  );
} 