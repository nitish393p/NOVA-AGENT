import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { CompanionStatus, AvatarEmotion } from '../types/companion';

export type AvatarGender = 'female' | 'male';

interface CompanionAvatarFaceProps {
  gender: AvatarGender;
  status: CompanionStatus;
  userVolume: number;
  companionVolume: number;
  emotion?: AvatarEmotion;
  isMicActive?: boolean;
  audioAnalyser?: AnalyserNode | null;
  className?: string;
}

interface AvatarFrameState {
  status: CompanionStatus;
  companionVolume: number;
  emotion: AvatarEmotion;
  audioAnalyser: AnalyserNode | null;
}

interface FaceMesh extends THREE.SkinnedMesh {
  morphTargetDictionary?: Record<string, number>;
  morphTargetInfluences?: number[];
}

const MODEL_URL = '/models/companion-face.glb';
const FACE_MESHES = new Set([
  'AvatarHead',
  'AvatarEyelashes',
  'AvatarLeftCornea',
  'AvatarLeftEyeball',
  'AvatarRightCornea',
  'AvatarRightEyeball',
  'AvatarTeethLower',
  'AvatarTeethUpper',
  'AvatarBody',
  'haircut',
  'outfit',
]);

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const smooth = (current: number, target: number, dt: number, speed: number) =>
  current + (target - current) * (1 - Math.exp(-dt / speed));

function setMorph(mesh: FaceMesh, name: string, value: number) {
  const index = mesh.morphTargetDictionary?.[name];
  if (index !== undefined && mesh.morphTargetInfluences) {
    mesh.morphTargetInfluences[index] = value;
  }
}

function aimBoneSegmentDown(bone: THREE.Bone | undefined, childName: string) {
  if (!bone) return;
  const child = bone.getObjectByName(childName);
  if (!child || !bone.parent) return;

  bone.updateWorldMatrix(true, true);
  const start = bone.getWorldPosition(new THREE.Vector3());
  const end = child.getWorldPosition(new THREE.Vector3());
  const direction = end.sub(start);
  if (direction.lengthSq() < 1e-8) return;
  direction.normalize();

  // Keep the arms close to the torso while bringing the elbows and wrists down.
  const side = Math.sign(bone.getWorldPosition(new THREE.Vector3()).x) || 1;
  const target = new THREE.Vector3(-side * 0.14, -0.98, 0).normalize();
  const delta = new THREE.Quaternion().setFromUnitVectors(direction, target);
  const currentWorld = bone.getWorldQuaternion(new THREE.Quaternion());
  const desiredWorld = delta.multiply(currentWorld);
  const parentWorld = bone.parent.getWorldQuaternion(new THREE.Quaternion());
  bone.quaternion.copy(parentWorld.invert().multiply(desiredWorld));
  bone.updateWorldMatrix(true, true);
}

function poseArmsDown(model: THREE.Group) {
  model.updateMatrixWorld(true);
  for (const side of ['Left', 'Right']) {
    aimBoneSegmentDown(model.getObjectByName(`${side}Arm`) as THREE.Bone | undefined, `${side}ForeArm`);
    aimBoneSegmentDown(model.getObjectByName(`${side}ForeArm`) as THREE.Bone | undefined, `${side}Hand`);
  }
  model.updateMatrixWorld(true);
}

export const CompanionAvatarFace: React.FC<CompanionAvatarFaceProps> = (props) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const gazeTargetRef = useRef({ x: 0, y: 0 });
  const frameStateRef = useRef<AvatarFrameState>({
    status: props.status,
    companionVolume: props.companionVolume,
    emotion: props.emotion ?? 'neutral',
    audioAnalyser: props.audioAnalyser ?? null,
  });

  // Keep animation inputs current without tearing down and rebuilding WebGL on
  // every voice meter, status, or emotion update (the source of the old flash).
  frameStateRef.current = {
    status: props.status,
    companionVolume: props.companionVolume,
    emotion: props.emotion ?? 'neutral',
    audioAnalyser: props.audioAnalyser ?? null,
  };

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    let disposed = false;
    let frameId = 0;
    let resizeObserver: ResizeObserver | null = null;
    let model: THREE.Group | null = null;
    let renderer: THREE.WebGLRenderer;

    try {
      renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: true,
        alpha: true,
        powerPreference: 'high-performance',
      });
    } catch (error) {
      console.error('Could not create the avatar renderer:', error);
      return;
    }

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    renderer.setClearColor(0x000000, 0);
    renderer.localClippingEnabled = true;

    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-0.19, 0.19, 0.265, -0.265, 0.01, 20);
    camera.position.set(0, 1.57, 2.5);
    camera.lookAt(0, 1.57, 0);
    const portraitCrop = new THREE.Plane(new THREE.Vector3(0, 1, 0), -1.28);

    scene.add(new THREE.HemisphereLight(0xffeadb, 0x29213c, 2.0));
    const keyLight = new THREE.DirectionalLight(0xffe2cc, 2.6);
    keyLight.position.set(-1.2, 2.3, 2.0);
    scene.add(keyLight);
    const fillLight = new THREE.DirectionalLight(0xb9d4ff, 1.15);
    fillLight.position.set(1.6, 1.7, 1.2);
    scene.add(fillLight);

    const faceMeshes: FaceMesh[] = [];
    const life = {
      lastTime: 0,
      jaw: 0,
      blinkClock: 0,
      nextBlink: 2.5 + Math.random() * 1.8,
      blinkDuration: 0.17,
      blink: 0,
      blinking: false,
      doubleBlink: false,
      queuedBlink: false,
      audioData: new Uint8Array(0),
      frequencyData: new Uint8Array(0),
      smoothGazeX: 0,
      smoothGazeY: 0,
      swayTime: 0,
      headTilt: 0,
      targetHeadTilt: 0,
      speechPhase: 0,
    };

    const loader = new GLTFLoader();
    loader.load(
      MODEL_URL,
      (gltf) => {
        if (disposed) {
          gltf.scene.traverse((object) => {
            if (object instanceof THREE.Mesh) {
              object.geometry.dispose();
              const materials = Array.isArray(object.material) ? object.material : [object.material];
              materials.forEach((material) => material.dispose());
            }
          });
          return;
        }

        model = gltf.scene;
        poseArmsDown(model);
        model.traverse((object) => {
          const mesh = object as FaceMesh;
          if (!mesh.isMesh) return;
          mesh.visible = FACE_MESHES.has(mesh.name);
          mesh.frustumCulled = false;
          if (mesh.visible && mesh.morphTargetDictionary && mesh.morphTargetInfluences) {
            faceMeshes.push(mesh);
          }
          if (mesh.material) {
            const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
            materials.forEach((material) => {
              if (mesh.name === 'AvatarBody' || mesh.name === 'outfit') {
                material.clippingPlanes = [portraitCrop];
              }
              if (mesh.name === 'haircut' && 'roughness' in material && typeof material.roughness === 'number') {
                material.roughness = Math.max(material.roughness, 0.68);
              }
              material.needsUpdate = true;
            });
          }
        });
        scene.add(model);
      },
      undefined,
      (error) => console.error('Could not load the 3D face model:', error),
    );

    const resize = () => {
      if (disposed) return;
      const width = Math.max(1, container.clientWidth);
      const height = Math.max(1, container.clientHeight);
      const aspect = width / height;
      const halfHeight = 0.265;
      camera.left = -halfHeight * aspect;
      camera.right = halfHeight * aspect;
      camera.top = halfHeight;
      camera.bottom = -halfHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
    };

    resize();
    resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(container);

    const animate = (now: number) => {
      if (disposed) return;
      const frameState = frameStateRef.current;
      const dt = life.lastTime ? Math.min(0.05, (now - life.lastTime) / 1000) : 1 / 60;
      life.lastTime = now;
      const speaking = frameState.status === 'speaking';
      const analyser = frameState.audioAnalyser;
      let targetJaw = 0;
      let roundness = 0;
      let widthness = 0;

      if (speaking) {
        if (analyser) {
          if (life.audioData.length !== analyser.fftSize) {
            life.audioData = new Uint8Array(analyser.fftSize);
            life.frequencyData = new Uint8Array(analyser.frequencyBinCount);
          }
          try {
            analyser.getByteTimeDomainData(life.audioData);
            analyser.getByteFrequencyData(life.frequencyData);
            let sumSquares = 0;
            for (const sample of life.audioData) {
              const normalized = (sample - 128) / 128;
              sumSquares += normalized * normalized;
            }
            const rms = Math.sqrt(sumSquares / Math.max(1, life.audioData.length));
            // Speech RMS varies with voice and microphone gain; compress it into
            // a modest jaw range so normal conversation never looks like a shout.
            targetJaw = clamp((rms - 0.018) * 2.6, 0, 0.3);

            let low = 0;
            let high = 0;
            const split = Math.max(1, Math.floor(life.frequencyData.length * 0.24));
            for (let i = 0; i < life.frequencyData.length; i++) {
              if (i < split) low += life.frequencyData[i];
              else high += life.frequencyData[i];
            }
            const lowMean = low / split;
            const highMean = high / Math.max(1, life.frequencyData.length - split);
            roundness = clamp((lowMean - highMean * 0.55) / 100, 0, 0.5);
            widthness = clamp((highMean - lowMean * 0.35) / 150, 0, 0.4);
          } catch {
            targetJaw = 0;
          }
        }

        // Speech synthesis fallback and quiet audio frames still get a small,
        // smooth syllable movement instead of a frozen or rapidly flickering jaw.
        if (targetJaw < 0.025 && frameState.companionVolume > 0.02) {
          life.speechPhase += dt * 8.5;
          const cadence = 0.28 + Math.max(0, Math.sin(life.speechPhase)) * 0.5;
          targetJaw = clamp((0.02 + frameState.companionVolume * 0.28) * cadence, 0, 0.24);
        } else {
          life.speechPhase += dt * 5.5;
        }
      } else {
        life.speechPhase = 0;
      }

      life.jaw = smooth(life.jaw, targetJaw, dt, targetJaw > life.jaw ? 0.055 : 0.11);

      // Natural blinks are scheduled independently of React renders and remain
      // smooth while the companion is speaking or listening.
      life.blinkClock += dt;
      if (!life.blinking && life.blinkClock >= life.nextBlink) {
        life.blinking = true;
        life.blinkClock = 0;
        life.blinkDuration = 0.17;
        life.doubleBlink = Math.random() < 0.16;
      }
      if (life.blinking) {
        const progress = life.blinkClock / life.blinkDuration;
        if (progress < 0.36) life.blink = progress / 0.36;
        else if (progress < 1) life.blink = 1 - (progress - 0.36) / 0.64;
        else {
          life.blink = 0;
          life.blinking = false;
          if (life.doubleBlink && !life.queuedBlink) {
            life.queuedBlink = true;
            life.nextBlink = 0.14;
          } else {
            life.queuedBlink = false;
            life.nextBlink = 2.4 + Math.random() * 3.2;
          }
        }
      }

      const emotionTargets: Record<string, number> = {
        mouthSmileLeft: 0.08,
        mouthSmileRight: 0.08,
        mouthFrownLeft: 0,
        mouthFrownRight: 0,
        mouthLeft: 0,
        mouthRight: 0,
        cheekSquintLeft: 0,
        cheekSquintRight: 0,
        browInnerUp: 0,
        browOuterUpLeft: 0,
        browOuterUpRight: 0,
        browDownLeft: 0,
        browDownRight: 0,
        eyeWideLeft: 0,
        eyeWideRight: 0,
        mouthPressLeft: 0,
        mouthPressRight: 0,
        eyeLookUpLeft: 0,
        eyeLookUpRight: 0,
      };
      switch (frameState.emotion) {
        case 'happy':
          emotionTargets.mouthSmileLeft = 0.34;
          emotionTargets.mouthSmileRight = 0.34;
          emotionTargets.cheekSquintLeft = 0.1;
          emotionTargets.cheekSquintRight = 0.1;
          break;
        case 'empathetic':
        case 'concerned':
          emotionTargets.mouthSmileLeft = 0.1;
          emotionTargets.mouthSmileRight = 0.1;
          emotionTargets.browInnerUp = 0.18;
          break;
        case 'sad':
          emotionTargets.mouthSmileLeft = 0;
          emotionTargets.mouthSmileRight = 0;
          emotionTargets.mouthFrownLeft = 0.18;
          emotionTargets.mouthFrownRight = 0.18;
          emotionTargets.browInnerUp = 0.2;
          break;
        case 'curious':
        case 'confused':
          emotionTargets.mouthSmileLeft = 0.12;
          emotionTargets.mouthSmileRight = 0.12;
          emotionTargets.browOuterUpLeft = 0.2;
          emotionTargets.browOuterUpRight = frameState.emotion === 'confused' ? 0.04 : 0.14;
          emotionTargets.browInnerUp = frameState.emotion === 'confused' ? 0.08 : 0;
          emotionTargets.mouthLeft = frameState.emotion === 'confused' ? 0.08 : 0;
          emotionTargets.eyeWideLeft = 0.08;
          emotionTargets.eyeWideRight = 0.08;
          break;
        case 'thoughtful':
          emotionTargets.browInnerUp = 0.14;
          emotionTargets.eyeLookUpLeft = 0.2;
          emotionTargets.eyeLookUpRight = 0.2;
          break;
        case 'surprised':
          emotionTargets.browOuterUpLeft = 0.28;
          emotionTargets.browOuterUpRight = 0.28;
          emotionTargets.eyeWideLeft = 0.2;
          emotionTargets.eyeWideRight = 0.2;
          break;
        case 'excited':
          emotionTargets.mouthSmileLeft = 0.32;
          emotionTargets.mouthSmileRight = 0.32;
          emotionTargets.cheekSquintLeft = 0.08;
          emotionTargets.cheekSquintRight = 0.08;
          emotionTargets.eyeWideLeft = 0.08;
          emotionTargets.eyeWideRight = 0.08;
          break;
        case 'calm':
          emotionTargets.mouthSmileLeft = 0.1;
          emotionTargets.mouthSmileRight = 0.1;
          break;
        case 'frustrated':
          emotionTargets.browDownLeft = 0.18;
          emotionTargets.browDownRight = 0.18;
          emotionTargets.mouthPressLeft = 0.14;
          emotionTargets.mouthPressRight = 0.14;
          emotionTargets.mouthSmileLeft = 0;
          emotionTargets.mouthSmileRight = 0;
          break;
        case 'analytical':
          emotionTargets.browDownLeft = 0.12;
          emotionTargets.browDownRight = 0.12;
          emotionTargets.mouthPressLeft = 0.08;
          emotionTargets.mouthPressRight = 0.08;
          break;
      }

      const emotionBlend = 1 - Math.exp(-dt / 0.32);
      const mouthBlend = 1 - Math.exp(-dt / 0.08);
      const gazeBlend = 1 - Math.exp(-dt / 0.16);
      life.smoothGazeX += (gazeTargetRef.current.x - life.smoothGazeX) * gazeBlend;
      life.smoothGazeY += (gazeTargetRef.current.y - life.smoothGazeY) * gazeBlend;
      const listeningTilt = frameState.status === 'listening' ? 0.025 : 0;
      const thinkingTilt = frameState.status === 'thinking' ? -0.025 : 0;
      life.targetHeadTilt = listeningTilt + thinkingTilt + life.smoothGazeX * -0.035;
      life.headTilt = smooth(life.headTilt, life.targetHeadTilt, dt, 0.3);
      life.swayTime += dt;

      for (const mesh of faceMeshes) {
        const isLashes = mesh.name === 'AvatarEyelashes';
        setMorph(mesh, 'eyeBlinkLeft', life.blink);
        setMorph(mesh, 'eyeBlinkRight', life.blink);
        setMorph(mesh, 'eyeLookOutLeft', clamp(life.smoothGazeX, -1, 1) * 0.35);
        setMorph(mesh, 'eyeLookInLeft', clamp(-life.smoothGazeX, -1, 1) * 0.35);
        setMorph(mesh, 'eyeLookOutRight', clamp(-life.smoothGazeX, -1, 1) * 0.35);
        setMorph(mesh, 'eyeLookInRight', clamp(life.smoothGazeX, -1, 1) * 0.35);
        for (const [name, target] of Object.entries(emotionTargets)) {
          const index = mesh.morphTargetDictionary?.[name];
          if (index !== undefined && mesh.morphTargetInfluences) {
            mesh.morphTargetInfluences[index] = smooth(mesh.morphTargetInfluences[index], target, dt, 0.32);
          }
        }
        setMorph(mesh, 'eyeLookUpLeft', emotionTargets.eyeLookUpLeft + clamp(-life.smoothGazeY, 0, 1) * 0.2);
        setMorph(mesh, 'eyeLookUpRight', emotionTargets.eyeLookUpRight + clamp(-life.smoothGazeY, 0, 1) * 0.2);

        if (!isLashes) {
          const jawIndex = mesh.morphTargetDictionary?.jawOpen;
          if (jawIndex !== undefined && mesh.morphTargetInfluences) {
            mesh.morphTargetInfluences[jawIndex] = life.jaw;
          }
          setMorph(mesh, 'mouthLowerDownLeft', life.jaw * 0.4);
          setMorph(mesh, 'mouthLowerDownRight', life.jaw * 0.4);
          setMorph(mesh, 'mouthFunnel', roundness * life.jaw);
          setMorph(mesh, 'mouthPucker', roundness * life.jaw * 0.35);
          setMorph(mesh, 'mouthStretchLeft', widthness * life.jaw);
          setMorph(mesh, 'mouthStretchRight', widthness * life.jaw);
          setMorph(mesh, 'mouthClose', 0);
        }
      }

      const head = model?.getObjectByName('Head') as THREE.Bone | undefined;
      if (head) {
        head.rotation.z = life.headTilt + Math.sin(life.swayTime * 0.75) * 0.008;
        head.rotation.x = speaking ? Math.sin(life.speechPhase) * 0.006 : 0;
      }

      renderer.render(scene, camera);
      frameId = requestAnimationFrame(animate);
    };

    frameId = requestAnimationFrame(animate);

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      resizeObserver?.disconnect();
      if (model) {
        scene.remove(model);
        model.traverse((object) => {
          if (!(object instanceof THREE.Mesh)) return;
          object.geometry.dispose();
          const materials = Array.isArray(object.material) ? object.material : [object.material];
          materials.forEach((material) => material.dispose());
        });
      }
      renderer.dispose();
    };
  }, []);

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    gazeTargetRef.current = {
      x: clamp(((event.clientX - rect.left) / rect.width - 0.5) * 2, -1, 1),
      y: clamp(((event.clientY - rect.top) / rect.height - 0.5) * 2, -1, 1),
    };
  };

  return (
    <div
      ref={containerRef}
      onPointerMove={handlePointerMove}
      onPointerLeave={() => { gazeTargetRef.current = { x: 0, y: 0 }; }}
      className={`relative w-full h-full flex items-center justify-center select-none overflow-hidden rounded-3xl ${props.className ?? ''}`}
      aria-label="Animated 3D companion face"
    >
      <canvas ref={canvasRef} className="w-full h-full block rounded-3xl" />
    </div>
  );
};
