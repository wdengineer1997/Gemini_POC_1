// TalkingHead.js - Component that renders and manages the 3D talking avatar
import { useEffect, useRef } from 'react';

export default function TalkingHead() {
  const containerRef = useRef(null);
  const modelRef = useRef(null);
  const mixerRef = useRef(null);
  const isAnimatingRef = useRef(false);
  const jawBoneRef = useRef(null);
  const mouthControls = useRef({
    jawOpen: null,
    mouthClose: null,
    mouthOpen: null,
    lastUpdateTime: 0,
    targetValue: 0,
    currentValue: 0,
    animationDuration: 5000, // ms
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
        scene.background = new THREE.Color(0xf5f5f5);
        
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
            model.scale.set(1.5, 1.5, 1.5); // Slightly larger model
            
            // Setup animations if available
            if (gltf.animations && gltf.animations.length > 0) {
              mixer = new THREE.AnimationMixer(model);
              mixerRef.current = mixer; // Store mixer reference
              const clip = gltf.animations[0];
              const action = mixer.clipAction(clip);
              action.play();
            }
            
            // Start animation loop
            clock = new THREE.Clock();
            animate();
            
            // Expose speaking function to window
            window.speakWithAudio = (audioData) => {
              console.log('Speaking with audio data, length:', audioData?.length || 0);
              
              // If we're already animating, don't start again
              if (isAnimatingRef.current) return;
              
              isAnimatingRef.current = true;
              
              // Reset animation state
              mouthControls.current.lastUpdateTime = Date.now();
              mouthControls.current.targetValue = 0;
              mouthControls.current.currentValue = 0;
              
              // Start lip sync animation
              animateLipSync();
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
        
        // Animation loop
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
        
        // Lip sync animation function
        function animateLipSync() {
          const now = Date.now();
          const elapsed = now - mouthControls.current.lastUpdateTime;
          
          // Generate new target values at regular intervals
          if (elapsed > 100) { // Change mouth target every 100ms
            mouthControls.current.lastUpdateTime = now;
            
            // Create a pattern of mouth movements using sine wave and randomness
            const totalElapsed = now - mouthControls.current.lastUpdateTime;
            const animProgress = totalElapsed / mouthControls.current.animationDuration;
            
            if (animProgress < 1) {
              // Combine sine wave with randomness for more natural movement
              // Values between 0 (closed) and 1 (open)
              const baseValue = Math.sin(totalElapsed * 0.01) * 0.5 + 0.5;
              const randomVariation = Math.random() * 0.3 - 0.15; // ±0.15 randomness
              mouthControls.current.targetValue = Math.max(0, Math.min(1, baseValue + randomVariation));
            } else {
              // End animation after duration
              mouthControls.current.targetValue = 0;
              if (totalElapsed > mouthControls.current.animationDuration + 300) {
                isAnimatingRef.current = false;
                return;
              }
            }
          }
          
          // Smoothly interpolate current value towards target
          const lerp = 0.3; // Adjust for smoother/sharper transitions
          mouthControls.current.currentValue += (mouthControls.current.targetValue - mouthControls.current.currentValue) * lerp;
          
          // Apply the current value to the model
          applyMouthValue(mouthControls.current.currentValue);
          
          // Continue animation if still active
          if (isAnimatingRef.current) {
            requestAnimationFrame(animateLipSync);
          }
        }
        
        // Apply mouth value to the model
        function applyMouthValue(value) {
          // Method 1: Use morph targets if available
          if (mouthControls.current.jawOpen) {
            const mesh = mouthControls.current.jawOpen.mesh;
            const index = mouthControls.current.jawOpen.index;
            if (mesh && mesh.morphTargetInfluences) {
              mesh.morphTargetInfluences[index] = value;
            }
          }
          
          // Method 2: Use jaw bone rotation if available
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
            
            // Apply rotation to jaw bone - adjust multiplier to match your model
            jawBone.rotation.x = originalRotation.x + value * 0.2; // Open mouth by rotating jaw
          }
          
          // Method 3: Fallback to head movement if no mouth controls available
          if (!mouthControls.current.jawOpen && !jawBoneRef.current && modelRef.current) {
            const head = modelRef.current;
            const nodAmount = value * 0.05; // Small head movement as fallback
            head.rotation.x = nodAmount;
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
      
      window.removeEventListener('resize', handleResize);
      window.speakWithAudio = null;
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