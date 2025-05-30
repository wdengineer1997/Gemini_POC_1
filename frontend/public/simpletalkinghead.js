// Simple TalkingHead implementation without ES modules

// Wait for DOM to load
document.addEventListener('DOMContentLoaded', () => {
  console.log('Initializing SimpleTalkingHead...');
  
  // Create container for the avatar
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
  
  // Load 3D model
  const loader = new THREE.GLTFLoader();
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
}); 