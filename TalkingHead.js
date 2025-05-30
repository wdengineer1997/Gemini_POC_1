// TalkingHead.js - Component that renders and manages the 3D talking avatar
import { useEffect, useRef } from 'react';

export default function TalkingHead() {
  const containerRef = useRef(null);
  const modelRef = useRef(null);
  const mixerRef = useRef(null);
  const isAnimatingRef = useRef(false);
  const jawBoneRef = useRef(null);
  const audioContextRef = useRef(null);
  const audioAnalyserRef = useRef(null);
  const audioSourceRef = useRef(null);
  const animationFrameRef = useRef(null);
  const animationTimeoutRef = useRef(null);
  const blinkIntervalRef = useRef(null); // New ref for eye blinking
  const randomMovementIntervalRef = useRef(null);
  const mouthControls = useRef({
    jawOpen: null,
    mouthClose: null,
    visemes: {}, // Store all viseme morph targets
    lastUpdateTime: 0,
    targetValue: 0,
    currentValue: 0,
  });
  const facialExpressionsRef = useRef({
    eyeBlink: { left: 0, right: 0, nextBlink: 0 },
    eyeMovement: { x: 0, y: 0, nextMove: 0 },
    browMovement: { value: 0, nextMove: 0 },
    mouthExpression: { value: 0, type: 'neutral', nextChange: 0 },
  });

  useEffect(() => {
    if (!containerRef.current) return;
    
    let scene, camera, renderer, mixer, clock;
    
    const init = async () => {
      try {
        // Dynamically import Three.js (only in browser)
        const THREE = await import('three');
        const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader');
        
        // Setup scene
        scene = new THREE.Scene();
        scene.background = new THREE.Color(0x121212); // Darker background for video call feel
        
        // Setup camera
        camera = new THREE.PerspectiveCamera(45, containerRef.current.clientWidth / containerRef.current.clientHeight, 0.1, 1000);
        camera.position.set(0, 1.6, 1.8);
        camera.lookAt(0, 1.4, 0);
        
        // Setup renderer
        renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setSize(containerRef.current.clientWidth, containerRef.current.clientHeight);
        renderer.setPixelRatio(window.devicePixelRatio);
        containerRef.current.appendChild(renderer.domElement);
        
        // Setup lighting
        const ambientLight = new THREE.AmbientLight(0xffffff, 1);
        scene.add(ambientLight);
        
        const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
        directionalLight.position.set(0, 1, 1);
        scene.add(directionalLight);
        
        // Setup Audio Context for analysis
        try {
          if (window.AudioContext || window.webkitAudioContext) {
            audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
            audioAnalyserRef.current = audioContextRef.current.createAnalyser();
            audioAnalyserRef.current.fftSize = 256; // Smaller FFT size for better performance
          }
        } catch (err) {
          console.warn('Audio Context could not be created:', err);
        }
        
        // Load model
        const loader = new GLTFLoader();
        console.log('Loading 3D model from path:', '/talkinghead/avatars/brunette.glb');
        
        loader.load(
          '/talkinghead/avatars/brunette.glb',
          (gltf) => {
            console.log('Model loaded successfully!');
            const model = gltf.scene;
            scene.add(model);
            modelRef.current = model;
            
            // Log all bones to help identify mouth parts
            console.log('Bone structure:');
            model.traverse((object) => {
              if (object.isBone || object.isSkinnedMesh || object.isMesh) {
                console.log(`Found object: ${object.name}, type: ${object.type}`);
                
                // Look for morph targets (blendshapes) for mouth/face
                if (object.morphTargetDictionary) {
                  console.log('Found morph targets:', Object.keys(object.morphTargetDictionary));
                  
                  // Store references to mouth morphs if available
                  const morphDict = object.morphTargetDictionary;
                  if (morphDict) {
                    // Check for common morph target names used for mouth/speech
                    const jawOpenNames = ['jawOpen', 'mouthOpen', 'JawOpen', 'MouthOpen', 'jaw_open'];
                    const mouthCloseNames = ['mouthClose', 'MouthClose', 'mouth_close'];
                    
                    // Store all viseme morph targets
                    for (const key in morphDict) {
                      if (key.startsWith('viseme_')) {
                        console.log(`Found viseme morph: ${key}`);
                        mouthControls.current.visemes[key] = {
                          mesh: object,
                          index: morphDict[key],
                          weight: 0
                        };
                      }
                    }
                    
                    for (const name of jawOpenNames) {
                      if (morphDict[name] !== undefined) {
                        console.log(`Found jaw open morph: ${name}`);
                        mouthControls.current.jawOpen = {
                          mesh: object,
                          index: morphDict[name]
                        };
                        break;
                      }
                    }
                    
                    for (const name of mouthCloseNames) {
                      if (morphDict[name] !== undefined) {
                        console.log(`Found mouth close morph: ${name}`);
                        mouthControls.current.mouthClose = {
                          mesh: object,
                          index: morphDict[name]
                        };
                        break;
                      }
                    }
                  }
                }
              }
              
              // Find jaw bone
              const name = (object.name || '').toLowerCase();
              if (
                name.includes('jaw') || 
                name.includes('mouth') || 
                name.includes('chin') ||
                name.includes('teeth') ||
                name.includes('tongue')
              ) {
                console.log('Found potential jaw/mouth bone:', object.name);
                jawBoneRef.current = object;
              }
            });
            
            // Center model
            const box = new THREE.Box3().setFromObject(model);
            const center = box.getCenter(new THREE.Vector3());
            model.position.x = -center.x;
            model.position.y = -center.y + 0.1; // Slight offset upward
            model.position.z = -center.z;
            
            // Optional: adjust scale if needed
            model.scale.set(1.6, 1.6, 1.6); // Slightly larger model
            
            // Setup animations if available
            if (gltf.animations && gltf.animations.length > 0) {
              mixer = new THREE.AnimationMixer(model);
              mixerRef.current = mixer; // Store mixer reference
              const clip = gltf.animations[0];
              const action = mixer.clipAction(clip);
              action.play();
            }
            
            // Start random eye blinking
            startRandomEyeBlink();
            
            // Start animation loop
            clock = new THREE.Clock();
            animate();
            
            // Hook up audio listeners for global audio element
            const setupAudioListener = () => {
              const audioElements = document.querySelectorAll('audio');
              if (audioElements.length > 0) {
                console.log('Found audio elements:', audioElements.length);
                
                audioElements.forEach(audio => {
                  // Remove previous listeners if any
                  audio.removeEventListener('play', onAudioPlay);
                  audio.removeEventListener('pause', onAudioPause);
                  audio.removeEventListener('ended', onAudioEnded);
                  
                  // Add new listeners
                  audio.addEventListener('play', onAudioPlay);
                  audio.addEventListener('pause', onAudioPause);
                  audio.addEventListener('ended', onAudioEnded);
                  
                  console.log('Added event listeners to audio element');
                });
              } else {
                // If no audio elements found yet, try again later
                setTimeout(setupAudioListener, 1000);
              }
            };
            
            // Try to find audio elements once the DOM is loaded
            setupAudioListener();
            
            // Expose speaking function to window
            window.speakWithAudio = (audioData) => {
              console.log('Speaking with audio data, length:', audioData?.length || 0);
              
              // Cancel any previous animation
              stopAllAnimations();
              
              if (!audioData || audioData.length === 0) {
                resetMouthState();
                return;
              }
              
              // Set a flag indicating we're animating
              isAnimatingRef.current = true;
              
              // Start a pattern-based animation since we can't reliably decode the audio
              startPatternBasedAnimation(audioData);
              
              // Set a timeout to stop the animation after estimated audio duration
              // Estimate: ~44100 samples per second for audio (rough estimate)
              const estimatedDuration = (audioData.length / 44100) * 1000;
              console.log('Estimated audio duration:', estimatedDuration, 'ms');
              
              if (animationTimeoutRef.current) {
                clearTimeout(animationTimeoutRef.current);
              }
              
              animationTimeoutRef.current = setTimeout(() => {
                console.log('Animation timeout reached, stopping animation');
                stopAllAnimations();
              }, estimatedDuration + 500); // Add small buffer
            };
            
            // NEW: Add function to process viseme data from socket
            window.processVisemeData = (data) => {
              console.log('Processing viseme data:', data);
              
              // Stop any current animation
              stopAllAnimations();
              
              if (!data || !data.visemes || data.visemes.length === 0) {
                console.warn('Invalid viseme data received');
                return;
              }
              
              // Start viseme-based animation
              startVisemeBasedAnimation(data.visemes, data.duration || 3000);
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
        
        // Animation loop for rendering
        function animate() {
          requestAnimationFrame(animate);
          
          if (mixer) {
            mixer.update(clock.getDelta());
          }
          
          renderer.render(scene, camera);
        }
        
        // Handle window resize
        const handleResize = () => {
          if (!containerRef.current) return;
          
          camera.aspect = containerRef.current.clientWidth / containerRef.current.clientHeight;
          camera.updateProjectionMatrix();
          renderer.setSize(containerRef.current.clientWidth, containerRef.current.clientHeight);
        };
        
        window.addEventListener('resize', handleResize);
        
        // Audio event handlers
        function onAudioPlay(e) {
          console.log('Audio playback started');
          if (!isAnimatingRef.current) {
            isAnimatingRef.current = true;
            startLipSyncAnimation();
          }
        }
        
        function onAudioPause(e) {
          console.log('Audio playback paused');
          stopAllAnimations();
        }
        
        function onAudioEnded(e) {
          console.log('Audio playback ended');
          stopAllAnimations();
        }
        
        // Stop all animations and reset mouth state
        function stopAllAnimations() {
          isAnimatingRef.current = false;
          
          if (animationFrameRef.current) {
            cancelAnimationFrame(animationFrameRef.current);
            animationFrameRef.current = null;
          }
          
          if (animationTimeoutRef.current) {
            clearTimeout(animationTimeoutRef.current);
            animationTimeoutRef.current = null;
          }
          
          resetMouthState();
        }
        
        // Reset all mouth controls to default state
        function resetMouthState() {
          // Reset all viseme weights
          for (const key in mouthControls.current.visemes) {
            const viseme = mouthControls.current.visemes[key];
            if (viseme.mesh && viseme.mesh.morphTargetInfluences) {
              viseme.mesh.morphTargetInfluences[viseme.index] = 0;
            }
          }
          
          // Reset jaw open
          if (mouthControls.current.jawOpen) {
            const mesh = mouthControls.current.jawOpen.mesh;
            const index = mouthControls.current.jawOpen.index;
            if (mesh && mesh.morphTargetInfluences) {
              mesh.morphTargetInfluences[index] = 0;
            }
          }
          
          // Reset mouth close
          if (mouthControls.current.mouthClose) {
            const mesh = mouthControls.current.mouthClose.mesh;
            const index = mouthControls.current.mouthClose.index;
            if (mesh && mesh.morphTargetInfluences) {
              mesh.morphTargetInfluences[index] = 0;
            }
          }
          
          // Reset jaw bone rotation
          if (jawBoneRef.current && jawBoneRef.current.originalRotation) {
            jawBoneRef.current.rotation.x = jawBoneRef.current.originalRotation.x;
            jawBoneRef.current.rotation.y = jawBoneRef.current.originalRotation.y;
            jawBoneRef.current.rotation.z = jawBoneRef.current.originalRotation.z;
          }
        }
        
        // NEW: Random eye blinking
        function startRandomEyeBlink() {
          // Clear any existing interval
          if (blinkIntervalRef.current) {
            clearInterval(blinkIntervalRef.current);
          }
          
          // Set an interval for random blinking
          blinkIntervalRef.current = setInterval(() => {
            if (Math.random() > 0.3) { // 70% chance to blink when interval is hit
              triggerEyeBlink();
            }
          }, 3000 + Math.random() * 4000); // Random interval between 3-7 seconds
        }
        
        // NEW: Trigger eye blink animation
        function triggerEyeBlink() {
          // Find eyes in model
          modelRef.current.traverse((object) => {
            if (object.morphTargetDictionary) {
              const leftBlinkIndex = object.morphTargetDictionary['eyeBlinkLeft'];
              const rightBlinkIndex = object.morphTargetDictionary['eyeBlinkRight'];
              
              if (leftBlinkIndex !== undefined && rightBlinkIndex !== undefined) {
                // Blink duration (150-250ms)
                const blinkDuration = 150 + Math.random() * 100;
                
                // Close eyes
                object.morphTargetInfluences[leftBlinkIndex] = 1;
                object.morphTargetInfluences[rightBlinkIndex] = 1;
                
                // Open eyes after duration
                setTimeout(() => {
                  // Smooth opening
                  const startTime = Date.now();
                  const animateEyeOpen = () => {
                    const elapsed = Date.now() - startTime;
                    const progress = Math.min(1, elapsed / 80); // 80ms for opening
                    const value = 1 - progress; // 1 to 0
                    
                    object.morphTargetInfluences[leftBlinkIndex] = value;
                    object.morphTargetInfluences[rightBlinkIndex] = value;
                    
                    if (progress < 1) {
                      requestAnimationFrame(animateEyeOpen);
                    }
                  };
                  
                  animateEyeOpen();
                }, blinkDuration);
              }
            }
          });
        }
        
        // Start pattern-based animation (since audio decoding is failing)
        function startPatternBasedAnimation(audioData) {
          const patternConfig = {
            startTime: Date.now(),
            wordDuration: 300, // Average word duration in ms
            pauseDuration: 100, // Average pause between words
            syllableCount: Math.ceil(audioData.length / 8000), // Rough estimate of syllables based on audio length
            currentSyllable: 0
          };
          
          console.log('Starting pattern-based animation with estimated syllables:', patternConfig.syllableCount);
          
          // Start the animation loop
          animatePatternBasedLipSync(patternConfig);
        }
        
        // Pattern-based lip sync animation that doesn't rely on audio decoding
        function animatePatternBasedLipSync(pattern) {
          if (!isAnimatingRef.current) {
            resetMouthState();
            return;
          }
          
          const now = Date.now();
          const elapsed = now - pattern.startTime;
          const syllableDuration = pattern.wordDuration / 2; // Duration of each syllable
          const cycleDuration = syllableDuration + pattern.pauseDuration;
          
          // Calculate the current position in the syllable cycle
          const cyclePosition = (elapsed % cycleDuration) / syllableDuration;
          
          // Value between 0 and 1 representing mouth openness
          let openValue;
          
          if (cyclePosition < 1) {
            // Opening and closing mouth for syllable
            // Use sine wave for smooth motion (half cycle)
            openValue = Math.sin(cyclePosition * Math.PI) * 0.8;
          } else {
            // Pause between syllables
            openValue = 0;
          }
          
          // Apply a bit of random variation
          const variation = Math.random() * 0.1;
          openValue = Math.max(0, Math.min(1, openValue + variation));
          
          // Apply to visemes based on openness
          applyVisemesBasedOnOpenness(openValue);
          
          // Continue animation
          animationFrameRef.current = requestAnimationFrame(() => {
            animatePatternBasedLipSync(pattern);
          });
        }
        
        // NEW: Viseme-based animation
        function startVisemeBasedAnimation(visemes, duration) {
          console.log(`Starting viseme animation with ${visemes.length} visemes over ${duration}ms`);
          
          isAnimatingRef.current = true;
          const startTime = Date.now();
          
          // Animation function
          function animateVisemes() {
            if (!isAnimatingRef.current) {
              resetMouthState();
              return;
            }
            
            const now = Date.now();
            const elapsed = now - startTime;
            const progress = Math.min(1, elapsed / duration);
            
            // Get current viseme based on progress
            const visemeIndex = Math.min(Math.floor(progress * visemes.length), visemes.length - 1);
            const currentViseme = visemes[visemeIndex];
            
            // Reset all viseme weights first
            for (const key in mouthControls.current.visemes) {
              mouthControls.current.visemes[key].weight = 0;
            }
            
            // Apply current viseme
            if (currentViseme) {
              const visemeKey = `viseme_${currentViseme}`;
              
              if (mouthControls.current.visemes[visemeKey]) {
                // Set weight for this viseme
                mouthControls.current.visemes[visemeKey].weight = 1.0;
                
                // For certain visemes, add facial expressions
                if (['aa', 'O'].includes(currentViseme)) {
                  // Wide open mouth for these vowels
                  if (mouthControls.current.jawOpen) {
                    const mesh = mouthControls.current.jawOpen.mesh;
                    const index = mouthControls.current.jawOpen.index;
                    if (mesh && mesh.morphTargetInfluences) {
                      mesh.morphTargetInfluences[index] = 0.8;
                    }
                  }
                } else if (['E', 'I'].includes(currentViseme)) {
                  // Slightly open mouth for these vowels
                  if (mouthControls.current.jawOpen) {
                    const mesh = mouthControls.current.jawOpen.mesh;
                    const index = mouthControls.current.jawOpen.index;
                    if (mesh && mesh.morphTargetInfluences) {
                      mesh.morphTargetInfluences[index] = 0.5;
                    }
                  }
                }
                
                // Add random facial movements for more realism
                if (Math.random() > 0.9) {
                  // Find and apply random facial expression
                  modelRef.current.traverse((object) => {
                    if (object.morphTargetDictionary) {
                      // Possible expressions
                      const expressions = [
                        'browInnerUp', 'browOuterUpLeft', 'browOuterUpRight',
                        'eyeSquintLeft', 'eyeSquintRight'
                      ];
                      
                      // Pick a random expression
                      const randomExp = expressions[Math.floor(Math.random() * expressions.length)];
                      const expIndex = object.morphTargetDictionary[randomExp];
                      
                      if (expIndex !== undefined) {
                        // Apply expression briefly
                        const value = 0.2 + Math.random() * 0.3; // 0.2-0.5 intensity
                        object.morphTargetInfluences[expIndex] = value;
                        
                        // Clear after short delay
                        setTimeout(() => {
                          object.morphTargetInfluences[expIndex] = 0;
                        }, 300 + Math.random() * 200);
                      }
                    }
                  });
                }
              }
            }
            
            // Apply all viseme weights with smooth interpolation
            for (const key in mouthControls.current.visemes) {
              const viseme = mouthControls.current.visemes[key];
              if (viseme.mesh && viseme.mesh.morphTargetInfluences) {
                const currentWeight = viseme.mesh.morphTargetInfluences[viseme.index] || 0;
                const targetWeight = viseme.weight || 0;
                
                // Smooth interpolation (LERP)
                const newWeight = currentWeight + (targetWeight - currentWeight) * 0.3;
                viseme.mesh.morphTargetInfluences[viseme.index] = newWeight;
              }
            }
            
            // Continue if not complete
            if (progress < 1) {
              animationFrameRef.current = requestAnimationFrame(animateVisemes);
            } else {
              // Animation complete
              console.log('Viseme animation complete');
              resetMouthState();
              isAnimatingRef.current = false;
            }
          }
          
          // Start the animation
          animateVisemes();
          
          // Safety timeout
          if (animationTimeoutRef.current) {
            clearTimeout(animationTimeoutRef.current);
          }
          
          animationTimeoutRef.current = setTimeout(() => {
            console.log('Viseme animation safety timeout reached');
            resetMouthState();
            isAnimatingRef.current = false;
          }, duration + 500);
        }
        
        // Start real-time audio-based lip sync animation using AudioContext API
        function startLipSyncAnimation() {
          if (!audioContextRef.current || !audioAnalyserRef.current) {
            // Fallback to pattern-based animation if audio context not available
            console.log('No AudioContext available, using pattern-based animation');
            startPatternBasedAnimation(new Uint8Array(10000));
            return;
          }
          
          try {
            const audioElements = document.querySelectorAll('audio');
            if (audioElements.length > 0) {
              // If we already have a source, disconnect it
              if (audioSourceRef.current) {
                try {
                  audioSourceRef.current.disconnect();
                } catch (e) {
                  console.warn('Error disconnecting previous audio source:', e);
                }
              }
              
              // Create a media element source from the audio element
              audioSourceRef.current = audioContextRef.current.createMediaElementSource(audioElements[0]);
              audioSourceRef.current.connect(audioAnalyserRef.current);
              audioAnalyserRef.current.connect(audioContextRef.current.destination);
              
              // Configure analyzer
              audioAnalyserRef.current.fftSize = 256;
              audioAnalyserRef.current.smoothingTimeConstant = 0.8;
              
              // Start the animation loop
              animateAudioBasedLipSync();
            } else {
              console.warn('No audio elements found for lip sync');
              // Fallback to pattern-based animation
              startPatternBasedAnimation(new Uint8Array(10000));
            }
          } catch (error) {
            console.error('Error setting up audio analysis:', error);
            // Fallback to pattern-based animation
            startPatternBasedAnimation(new Uint8Array(10000));
          }
        }
        
        // Real-time audio-based lip sync animation
        function animateAudioBasedLipSync() {
          if (!isAnimatingRef.current || !audioAnalyserRef.current) {
            resetMouthState();
            return;
          }
          
          try {
            // Get frequency data
            const bufferLength = audioAnalyserRef.current.frequencyBinCount;
            const dataArray = new Uint8Array(bufferLength);
            audioAnalyserRef.current.getByteFrequencyData(dataArray);
            
            // Calculate average amplitude, focusing on speech frequencies (500-2000 Hz)
            // Approximate the frequency range based on fftSize and sample rate
            const sampleRate = audioContextRef.current.sampleRate || 44100;
            const binSize = sampleRate / (audioAnalyserRef.current.fftSize * 2);
            
            const lowBin = Math.floor(500 / binSize);
            const highBin = Math.floor(2000 / binSize);
            
            let sum = 0;
            let count = 0;
            
            for (let i = lowBin; i <= highBin && i < bufferLength; i++) {
              sum += dataArray[i];
              count++;
            }
            
            // Normalize to 0-1 range
            const amplitude = count > 0 ? (sum / count) / 255 : 0;
            
            // Apply to visemes based on amplitude
            applyVisemesBasedOnOpenness(amplitude);
            
            // Continue animation
            animationFrameRef.current = requestAnimationFrame(animateAudioBasedLipSync);
          } catch (error) {
            console.error('Error in audio analysis:', error);
            // Fallback to pattern-based animation
            startPatternBasedAnimation(new Uint8Array(10000));
          }
        }
        
        // Apply viseme weights based on mouth openness value
        function applyVisemesBasedOnOpenness(openValue) {
          // Reset all viseme weights first
          for (const key in mouthControls.current.visemes) {
            mouthControls.current.visemes[key].weight = 0;
          }
          
          // Set visemes based on openness value
          if (openValue < 0.1) {
            // Closed mouth
            setVisemeWeight('viseme_sil', 1.0);
            setVisemeWeight('viseme_PP', 0.2);
          } else if (openValue < 0.3) {
            // Slightly open
            setVisemeWeight('viseme_PP', 0.5);
            setVisemeWeight('viseme_FF', 0.5);
            setVisemeWeight('viseme_TH', 0.3);
          } else if (openValue < 0.5) {
            // Medium open
            setVisemeWeight('viseme_DD', 0.3);
            setVisemeWeight('viseme_kk', 0.3);
            setVisemeWeight('viseme_CH', 0.4);
            setVisemeWeight('viseme_E', 0.6);
          } else if (openValue < 0.7) {
            // More open
            setVisemeWeight('viseme_aa', 0.7);
            setVisemeWeight('viseme_E', 0.3);
          } else {
            // Wide open
            setVisemeWeight('viseme_aa', 1.0);
            setVisemeWeight('viseme_O', 0.3);
          }
          
          // Apply all viseme weights with smooth interpolation
          for (const key in mouthControls.current.visemes) {
            const viseme = mouthControls.current.visemes[key];
            if (viseme.mesh && viseme.mesh.morphTargetInfluences) {
              const currentWeight = viseme.mesh.morphTargetInfluences[viseme.index] || 0;
              const targetWeight = viseme.weight || 0;
              // Smooth interpolation (LERP)
              const newWeight = currentWeight + (targetWeight - currentWeight) * 0.3;
              viseme.mesh.morphTargetInfluences[viseme.index] = newWeight;
            }
          }
          
          // Also apply to jawOpen as fallback
          if (mouthControls.current.jawOpen) {
            const mesh = mouthControls.current.jawOpen.mesh;
            const index = mouthControls.current.jawOpen.index;
            if (mesh && mesh.morphTargetInfluences) {
              const current = mesh.morphTargetInfluences[index] || 0;
              const target = openValue;
              // Smooth interpolation
              mesh.morphTargetInfluences[index] = current + (target - current) * 0.3;
            }
          }
          
          // Apply to jaw bone rotation as well
          if (jawBoneRef.current) {
            const jawBone = jawBoneRef.current;
            const originalRotation = jawBone.originalRotation || { 
              x: jawBone.rotation.x, 
              y: jawBone.rotation.y, 
              z: jawBone.rotation.z 
            };
            
            // Store original rotation if not already saved
            if (!jawBone.originalRotation) {
              jawBone.originalRotation = originalRotation;
            }
            
            // Apply rotation based on openness
            const current = {
              x: jawBone.rotation.x,
              y: jawBone.rotation.y,
              z: jawBone.rotation.z
            };
            
            const target = {
              x: originalRotation.x + openValue * 0.2,
              y: originalRotation.y,
              z: originalRotation.z
            };
            
            // Smooth interpolation
            jawBone.rotation.x = current.x + (target.x - current.x) * 0.3;
            jawBone.rotation.y = current.y + (target.y - current.y) * 0.3;
            jawBone.rotation.z = current.z + (target.z - current.z) * 0.3;
          }
        }
        
        // Helper to set viseme weight if it exists
        function setVisemeWeight(visemeName, weight) {
          if (mouthControls.current.visemes[visemeName]) {
            mouthControls.current.visemes[visemeName].weight = weight;
          }
        }
        
      } catch (error) {
        console.error('Error initializing TalkingHead:', error);
      }
    };
    
    init();
    
    // Cleanup
    return () => {
      if (renderer) {
        renderer.dispose();
        if (containerRef.current && containerRef.current.contains(renderer.domElement)) {
          containerRef.current.removeChild(renderer.domElement);
        }
      }
      
      // Disconnect audio source if exists
      if (audioSourceRef.current) {
        try {
          audioSourceRef.current.disconnect();
        } catch (e) {
          console.warn('Error disconnecting audio source:', e);
        }
      }
      
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      
      if (animationTimeoutRef.current) {
        clearTimeout(animationTimeoutRef.current);
      }
      
      // Clear eye blinking interval
      if (blinkIntervalRef.current) {
        clearInterval(blinkIntervalRef.current);
      }
      
      // Remove event listeners from audio elements
      const audioElements = document.querySelectorAll('audio');
      audioElements.forEach(audio => {
        audio.removeEventListener('play', onAudioPlay);
        audio.removeEventListener('pause', onAudioPause);
        audio.removeEventListener('ended', onAudioEnded);
      });
      
      window.removeEventListener('resize', handleResize);
      window.speakWithAudio = null;
      window.processVisemeData = null;
    };
  }, []);
  
  return (
    <div className="video-call-container">
      <div className="video-call-frame">
        <div className="video-call-header">
          <div className="video-call-indicator">
            <span className="recording-dot"></span>
            Live Call
          </div>
          <div className="video-call-timer">00:00</div>
        </div>
        
        <div 
          ref={containerRef} 
          className="video-call-content"
        />
        
        <div className="video-call-controls">
          <button className="control-button mute-button">
            <span className="control-icon">🔇</span>
          </button>
          <button className="control-button end-call">
            <span className="control-icon">📞</span>
          </button>
          <button className="control-button video-button">
            <span className="control-icon">📹</span>
          </button>
        </div>
      </div>
      
      <style jsx>{`
        .video-call-container {
          width: 100%;
          display: flex;
          justify-content: center;
          align-items: center;
          margin: 30px 0;
        }
        
        .video-call-frame {
          width: 80%;
          max-width: 600px;
          border-radius: 16px;
          overflow: hidden;
          box-shadow: 0 10px 25px rgba(0, 0, 0, 0.2);
          display: flex;
          flex-direction: column;
          background: #1e1e1e;
          border: 1px solid #333;
        }
        
        .video-call-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 12px 20px;
          background: #2d2d2d;
          color: white;
        }
        
        .video-call-indicator {
          display: flex;
          align-items: center;
          font-size: 14px;
        }
        
        .recording-dot {
          width: 8px;
          height: 8px;
          background: #ff3b30;
          border-radius: 50%;
          margin-right: 8px;
          animation: pulse 1.5s infinite;
        }
        
        .video-call-timer {
          font-size: 14px;
          font-family: monospace;
        }
        
        .video-call-content {
          width: 100%;
          height: 400px;
          background: #121212;
        }
        
        .video-call-controls {
          display: flex;
          justify-content: center;
          align-items: center;
          padding: 16px 0;
          background: #2d2d2d;
          gap: 16px;
        }
        
        .control-button {
          width: 50px;
          height: 50px;
          border-radius: 50%;
          border: none;
          display: flex;
          justify-content: center;
          align-items: center;
          cursor: pointer;
          transition: all 0.2s ease;
          background: #444;
          color: white;
        }
        
        .control-button:hover {
          background: #555;
        }
        
        .end-call {
          background: #ff3b30;
          transform: rotate(135deg);
        }
        
        .end-call:hover {
          background: #ff5146;
        }
        
        .control-icon {
          font-size: 20px;
        }
        
        @keyframes pulse {
          0% { opacity: 1; }
          50% { opacity: 0.5; }
          100% { opacity: 1; }
        }
      `}</style>
    </div>
  );
} 