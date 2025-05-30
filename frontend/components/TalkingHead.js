
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
  const blinkIntervalRef = useRef(null);
  const randomMovementIntervalRef = useRef(null);
  const mouthControls = useRef({
    jawOpen: null,
    mouthClose: null,
    visemes: {}, 
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
        
        const THREE = await import('three');
        const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader');
        
        
        scene = new THREE.Scene();
        scene.background = new THREE.Color(0xf5f5f5);
        
        
        camera = new THREE.PerspectiveCamera(45, containerRef.current.clientWidth / containerRef.current.clientHeight, 0.1, 1000);
        camera.position.set(0, 1.6, 1.8);
        camera.lookAt(0, 1.4, 0);
        
        
        renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setSize(containerRef.current.clientWidth, containerRef.current.clientHeight);
        renderer.setPixelRatio(window.devicePixelRatio);
        containerRef.current.appendChild(renderer.domElement);
        
        
        const ambientLight = new THREE.AmbientLight(0xffffff, 1);
        scene.add(ambientLight);
        
        const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
        directionalLight.position.set(0, 1, 1);
        scene.add(directionalLight);
        
        
        try {
          if (window.AudioContext || window.webkitAudioContext) {
            audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
            audioAnalyserRef.current = audioContextRef.current.createAnalyser();
            audioAnalyserRef.current.fftSize = 256; 
          }
        } catch (err) {
          console.warn('Audio Context could not be created:', err);
        }
        
        
        const loader = new GLTFLoader();
        console.log('Loading 3D model from path:', '/talkinghead/avatars/brunette.glb');
        
        loader.load(
          '/talkinghead/avatars/brunette.glb',
          (gltf) => {
            console.log('Model loaded successfully!');
            const model = gltf.scene;
            scene.add(model);
            modelRef.current = model;
            
            
            console.log('Bone structure:');
            model.traverse((object) => {
              if (object.isBone || object.isSkinnedMesh || object.isMesh) {
                console.log(`Found object: ${object.name}, type: ${object.type}`);
                
                
                if (object.morphTargetDictionary) {
                  console.log('Found morph targets:', Object.keys(object.morphTargetDictionary));
                  
                  
                  const morphDict = object.morphTargetDictionary;
                  if (morphDict) {
                    
                    const jawOpenNames = ['jawOpen', 'mouthOpen', 'JawOpen', 'MouthOpen', 'jaw_open'];
                    const mouthCloseNames = ['mouthClose', 'MouthClose', 'mouth_close'];
                    
                    
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
            
            const box = new THREE.Box3().setFromObject(model);
            const center = box.getCenter(new THREE.Vector3());
            model.position.x = -center.x;
            model.position.y = -center.y + 0.1; 
            model.position.z = -center.z;
            
            model.scale.set(1.6, 1.6, 1.6); 
            
            if (gltf.animations && gltf.animations.length > 0) {
              mixer = new THREE.AnimationMixer(model);
              mixerRef.current = mixer; 
              const clip = gltf.animations[0];
              const action = mixer.clipAction(clip);
              action.play();
            }
            
            clock = new THREE.Clock();
            animate();
            
            const setupAudioListener = () => {
              const audioElements = document.querySelectorAll('audio');
              if (audioElements.length > 0) {
                console.log('Found audio elements:', audioElements.length);
                
                audioElements.forEach(audio => {
                  audio.removeEventListener('play', onAudioPlay);
                  audio.removeEventListener('pause', onAudioPause);
                  audio.removeEventListener('ended', onAudioEnded);
                  
                  audio.addEventListener('play', onAudioPlay);
                  audio.addEventListener('pause', onAudioPause);
                  audio.addEventListener('ended', onAudioEnded);
                  
                  console.log('Added event listeners to audio element');
                });
              } else {
                setTimeout(setupAudioListener, 1000);
              }
            };
            
            setupAudioListener();
            
            window.speakWithAudio = (audioData) => {
              console.log('Speaking with audio data, length:', audioData?.length || 0);
              
              stopAllAnimations();
              
              if (!audioData || audioData.length === 0) {
                resetMouthState();
                return;
              }
              
              isAnimatingRef.current = true;
              
              startPatternBasedAnimation(audioData);
              
              const estimatedDuration = (audioData.length / 44100) * 1000;
              console.log('Estimated audio duration:', estimatedDuration, 'ms');
              
              if (animationTimeoutRef.current) {
                clearTimeout(animationTimeoutRef.current);
              }
              
              animationTimeoutRef.current = setTimeout(() => {
                console.log('Animation timeout reached, stopping animation');
                stopAllAnimations();
              }, estimatedDuration + 500); 
            };
            
            window.processVisemeData = (data) => {
              console.log('Processing viseme data:', data);
              
              stopAllAnimations();
              
              if (!data || !data.visemes || data.visemes.length === 0) {
                resetMouthState();
                return;
              }
              
              startVisemeBasedAnimation(data.visemes, data.duration || 3000);
            };
            
            startRandomEyeBlink();
          },
          (progress) => {
            const percent = (progress.loaded / progress.total) * 100;
            console.log(`Loading model: ${percent.toFixed(2)}%`);
          },
          (error) => {
            console.error('Error loading model:', error);
          }
        );
        
        function animate() {
          requestAnimationFrame(animate);
          
          if (mixer) {
            mixer.update(clock.getDelta());
          }
          
          renderer.render(scene, camera);
        }
        
        const handleResize = () => {
          if (!containerRef.current) return;
          
          camera.aspect = containerRef.current.clientWidth / containerRef.current.clientHeight;
          camera.updateProjectionMatrix();
          renderer.setSize(containerRef.current.clientWidth, containerRef.current.clientHeight);
        };
        
        window.addEventListener('resize', handleResize);
        
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
        
        function resetMouthState() {
          for (const key in mouthControls.current.visemes) {
            const viseme = mouthControls.current.visemes[key];
            if (viseme.mesh && viseme.mesh.morphTargetInfluences) {
              viseme.mesh.morphTargetInfluences[viseme.index] = 0;
            }
          }
          
          if (mouthControls.current.jawOpen) {
            const mesh = mouthControls.current.jawOpen.mesh;
            const index = mouthControls.current.jawOpen.index;
            if (mesh && mesh.morphTargetInfluences) {
              mesh.morphTargetInfluences[index] = 0;
            }
          }
          
          if (mouthControls.current.mouthClose) {
            const mesh = mouthControls.current.mouthClose.mesh;
            const index = mouthControls.current.mouthClose.index;
            if (mesh && mesh.morphTargetInfluences) {
              mesh.morphTargetInfluences[index] = 0;
            }
          }
          
          if (jawBoneRef.current && jawBoneRef.current.originalRotation) {
            jawBoneRef.current.rotation.x = jawBoneRef.current.originalRotation.x;
            jawBoneRef.current.rotation.y = jawBoneRef.current.originalRotation.y;
            jawBoneRef.current.rotation.z = jawBoneRef.current.originalRotation.z;
          }
        }
        
        function startPatternBasedAnimation(audioData) {
          const patternConfig = {
            startTime: Date.now(),
            wordDuration: 300, 
            pauseDuration: 100, 
            syllableCount: Math.ceil(audioData.length / 8000), 
            currentSyllable: 0
          };
          
          console.log('Starting pattern-based animation with estimated syllables:', patternConfig.syllableCount);
          
          animatePatternBasedLipSync(patternConfig);
        }
        
        function animatePatternBasedLipSync(pattern) {
          if (!isAnimatingRef.current) {
            resetMouthState();
            return;
          }
          
          const now = Date.now();
          const elapsed = now - pattern.startTime;
          const syllableDuration = pattern.wordDuration / 2;
          const cycleDuration = syllableDuration + pattern.pauseDuration;
          
          const cyclePosition = (elapsed % cycleDuration) / syllableDuration;
          
          let openValue;
          
          if (cyclePosition < 1) {
            openValue = Math.sin(cyclePosition * Math.PI) * 0.5; 
          } else {
            openValue = 0;
          }
          
          const variation = Math.random() * 0.1;
          openValue = Math.max(0, Math.min(1, openValue + variation));
          
          applyVisemesBasedOnOpenness(openValue);
          
          animationFrameRef.current = requestAnimationFrame(() => {
            animatePatternBasedLipSync(pattern);
          });
        }
        
        function startLipSyncAnimation() {
          if (!audioContextRef.current || !audioAnalyserRef.current) {
            console.log('No AudioContext available, using pattern-based animation');
            startPatternBasedAnimation(new Uint8Array(10000));
            return;
          }
          
          try {
            const audioElements = document.querySelectorAll('audio');
            if (audioElements.length > 0) {
              if (audioSourceRef.current) {
                try {
                  audioSourceRef.current.disconnect();
                } catch (e) {
                  console.warn('Error disconnecting previous audio source:', e);
                }
              }
              
              audioSourceRef.current = audioContextRef.current.createMediaElementSource(audioElements[0]);
              audioSourceRef.current.connect(audioAnalyserRef.current);
              audioAnalyserRef.current.connect(audioContextRef.current.destination);
              
              audioAnalyserRef.current.fftSize = 256;
              audioAnalyserRef.current.smoothingTimeConstant = 0.8;
              
              animateAudioBasedLipSync();
            } else {
              console.warn('No audio elements found for lip sync');
              startPatternBasedAnimation(new Uint8Array(10000));
            }
          } catch (error) {
            console.error('Error setting up audio analysis:', error);
            startPatternBasedAnimation(new Uint8Array(10000));
          }
        }
        
        function animateAudioBasedLipSync() {
          if (!isAnimatingRef.current || !audioAnalyserRef.current) {
            resetMouthState();
            return;
          }
          
          try {
            const bufferLength = audioAnalyserRef.current.frequencyBinCount;
            const dataArray = new Uint8Array(bufferLength);
            audioAnalyserRef.current.getByteFrequencyData(dataArray);
            
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
            
            const amplitude = count > 0 ? (sum / count) / 255 : 0;
            
            applyVisemesBasedOnOpenness(amplitude);
            
            animationFrameRef.current = requestAnimationFrame(animateAudioBasedLipSync);
          } catch (error) {
            console.error('Error in audio analysis:', error);
            startPatternBasedAnimation(new Uint8Array(10000));
          }
        }
        
        function applyVisemesBasedOnOpenness(openValue) {
          for (const key in mouthControls.current.visemes) {
            mouthControls.current.visemes[key].weight = 0;
          }
          
          if (openValue < 0.1) {
            setVisemeWeight('viseme_sil', 0.8); 
            setVisemeWeight('viseme_PP', 0.2);
          } else if (openValue < 0.3) {
            setVisemeWeight('viseme_PP', 0.4); 
            setVisemeWeight('viseme_FF', 0.4); 
            setVisemeWeight('viseme_TH', 0.2); 
          } else if (openValue < 0.5) {
            setVisemeWeight('viseme_DD', 0.2); 
            setVisemeWeight('viseme_kk', 0.2); 
            setVisemeWeight('viseme_CH', 0.3); 
            setVisemeWeight('viseme_E', 0.4); 
          } else if (openValue < 0.7) {
            setVisemeWeight('viseme_aa', 0.5); 
            setVisemeWeight('viseme_E', 0.2); 
          } else {
            setVisemeWeight('viseme_aa', 0.6); 
            setVisemeWeight('viseme_O', 0.2); 
          }
          
          for (const key in mouthControls.current.visemes) {
            const viseme = mouthControls.current.visemes[key];
            if (viseme.mesh && viseme.mesh.morphTargetInfluences) {
              const currentWeight = viseme.mesh.morphTargetInfluences[viseme.index] || 0;
              const targetWeight = viseme.weight || 0;
              const newWeight = currentWeight + (targetWeight - currentWeight) * 0.3;
              viseme.mesh.morphTargetInfluences[viseme.index] = newWeight;
            }
          }
          
          if (mouthControls.current.jawOpen) {
            const mesh = mouthControls.current.jawOpen.mesh;
            const index = mouthControls.current.jawOpen.index;
            if (mesh && mesh.morphTargetInfluences) {
              const current = mesh.morphTargetInfluences[index] || 0;
              const target = openValue * 0.6; 
              mesh.morphTargetInfluences[index] = current + (target - current) * 0.3;
            }
          }
          
          if (jawBoneRef.current) {
            const jawBone = jawBoneRef.current;
            const originalRotation = jawBone.originalRotation || { 
              x: jawBone.rotation.x, 
              y: jawBone.rotation.y, 
              z: jawBone.rotation.z 
            };
            
            if (!jawBone.originalRotation) {
              jawBone.originalRotation = originalRotation;
            }
            
            const current = {
              x: jawBone.rotation.x,
              y: jawBone.rotation.y,
              z: jawBone.rotation.z
            };
            
            const target = {
              x: originalRotation.x + openValue * 0.1, 
              y: originalRotation.y,
              z: originalRotation.z
            };
            
            jawBone.rotation.x = current.x + (target.x - current.x) * 0.3;
            jawBone.rotation.y = current.y + (target.y - current.y) * 0.3;
            jawBone.rotation.z = current.z + (target.z - current.z) * 0.3;
          }
        }
        
        function setVisemeWeight(visemeName, weight) {
          if (mouthControls.current.visemes[visemeName]) {
            mouthControls.current.visemes[visemeName].weight = weight;
          }
        }
        
        function startRandomEyeBlink() {
          if (blinkIntervalRef.current) {
            clearInterval(blinkIntervalRef.current);
          }
          
          blinkIntervalRef.current = setInterval(() => {
            if (!isAnimatingRef.current || Math.random() > 0.3) {
              modelRef.current.traverse((object) => {
                if (object.morphTargetDictionary) {
                  if (object.morphTargetDictionary['eyeBlinkLeft'] !== undefined) {
                    const index = object.morphTargetDictionary['eyeBlinkLeft'];
                    object.morphTargetInfluences[index] = 1;
                    
                    setTimeout(() => {
                      object.morphTargetInfluences[index] = 0;
                    }, 150 + Math.random() * 100);
                  }
                  
                  if (object.morphTargetDictionary['eyeBlinkRight'] !== undefined) {
                    const index = object.morphTargetDictionary['eyeBlinkRight'];
                    object.morphTargetInfluences[index] = 1;
                    
                    setTimeout(() => {
                      object.morphTargetInfluences[index] = 0;
                    }, 150 + Math.random() * 100);
                  }
                }
              });
            }
          }, 3000 + Math.random() * 4000); 
        }
        
        function startVisemeBasedAnimation(visemes, duration) {
          console.log(`Starting viseme animation with ${visemes.length} visemes over ${duration}ms`);
          
          isAnimatingRef.current = true;
          const startTime = Date.now();
          
          function animateVisemes() {
            if (!isAnimatingRef.current) {
              resetMouthState();
              return;
            }
            
            const now = Date.now();
            const elapsed = now - startTime;
            const progress = Math.min(1, elapsed / duration);
            
            const visemeIndex = Math.min(Math.floor(progress * visemes.length), visemes.length - 1);
            const currentViseme = visemes[visemeIndex];
            
            for (const key in mouthControls.current.visemes) {
              mouthControls.current.visemes[key].weight = 0;
            }
            
            if (currentViseme) {
              const visemeKey = `viseme_${currentViseme}`;
              
              if (mouthControls.current.visemes[visemeKey]) {
                mouthControls.current.visemes[visemeKey].weight = 0.7; 
                
                if (['aa', 'O'].includes(currentViseme)) {
                  if (mouthControls.current.jawOpen) {
                    const mesh = mouthControls.current.jawOpen.mesh;
                    const index = mouthControls.current.jawOpen.index;
                    if (mesh && mesh.morphTargetInfluences) {
                      mesh.morphTargetInfluences[index] = 0.5; 
                    }
                  }
                } else if (['E', 'I'].includes(currentViseme)) {
                  if (mouthControls.current.jawOpen) {
                    const mesh = mouthControls.current.jawOpen.mesh;
                    const index = mouthControls.current.jawOpen.index;
                    if (mesh && mesh.morphTargetInfluences) {
                      mesh.morphTargetInfluences[index] = 0.3; 
                    }
                  }
                }
                
                if (Math.random() > 0.9) {
                  
                }
              }
            }
            
            
            for (const key in mouthControls.current.visemes) {
              const viseme = mouthControls.current.visemes[key];
              if (viseme.mesh && viseme.mesh.morphTargetInfluences) {
                const currentWeight = viseme.mesh.morphTargetInfluences[viseme.index] || 0;
                const targetWeight = viseme.weight || 0;
                const newWeight = currentWeight + (targetWeight - currentWeight) * 0.3;
                viseme.mesh.morphTargetInfluences[viseme.index] = newWeight;
              }
            }
            
            if (progress < 1) {
              animationFrameRef.current = requestAnimationFrame(animateVisemes);
            } else {
              console.log('Viseme animation complete');
              resetMouthState();
              isAnimatingRef.current = false;
            }
          }
          
          
          animateVisemes();
          
          
          if (animationTimeoutRef.current) {
            clearTimeout(animationTimeoutRef.current);
          }
          
          animationTimeoutRef.current = setTimeout(() => {
            console.log('Viseme animation safety timeout reached');
            resetMouthState();
            isAnimatingRef.current = false;
          }, duration + 500);
        }
      } catch (error) {
        console.error('Error initializing TalkingHead:', error);
      }
    };
    
    init();
    
    
    return () => {
      if (renderer) {
        renderer.dispose();
        if (containerRef.current && containerRef.current.contains(renderer.domElement)) {
          containerRef.current.removeChild(renderer.domElement);
        }
      }
      
      
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
      
      
      const audioElements = document.querySelectorAll('audio');
      audioElements.forEach(audio => {
        audio.removeEventListener('play', onAudioPlay);
        audio.removeEventListener('pause', onAudioPause);
        audio.removeEventListener('ended', onAudioEnded);
      });
      
      window.removeEventListener('resize', handleResize);
      window.speakWithAudio = null;
      
      
      if (blinkIntervalRef.current) {
        clearInterval(blinkIntervalRef.current);
      }
      
      if (randomMovementIntervalRef.current) {
        clearInterval(randomMovementIntervalRef.current);
      }
      
      window.processVisemeData = null;
    };
  }, []);
  
  return (
    <div 
      ref={containerRef} 
      style={{ 
        width: '80%',
        height: '400px',
        margin: '30px auto',
        borderRadius: '12px',
        overflow: 'hidden',
        backgroundColor: '#f5f5f5'
      }}
    />
  );
        
} 