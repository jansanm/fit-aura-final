import React, { Suspense, useRef, useState, useEffect } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, useGLTF, Environment } from '@react-three/drei';
import * as THREE from 'three';
import { UserAvatar, ProductInfo } from '../types';

interface ThreeSceneProps {
  avatar: UserAvatar | null;
  activeProduct: ProductInfo | null;
}

// Spinning placeholder shown while model loads or when no model is available
const AvatarPlaceholder = () => {
  const group = useRef<THREE.Group>(null!);
  useFrame((_, delta) => {
    group.current.rotation.y += delta * 0.4;
  });
  return (
    <group ref={group}>
      {/* Body */}
      <mesh position={[0, 0.4, 0]}>
        <capsuleGeometry args={[0.28, 0.9, 8, 16]} />
        <meshStandardMaterial color="#3AD4FF" roughness={0.3} metalness={0.4} />
      </mesh>
      {/* Head */}
      <mesh position={[0, 1.25, 0]}>
        <sphereGeometry args={[0.22, 24, 24]} />
        <meshStandardMaterial color="#3AD4FF" roughness={0.3} metalness={0.4} />
      </mesh>
      {/* Left arm */}
      <mesh position={[-0.42, 0.5, 0]} rotation={[0, 0, 0.3]}>
        <capsuleGeometry args={[0.08, 0.55, 6, 12]} />
        <meshStandardMaterial color="#2E57A5" roughness={0.3} metalness={0.4} />
      </mesh>
      {/* Right arm */}
      <mesh position={[0.42, 0.5, 0]} rotation={[0, 0, -0.3]}>
        <capsuleGeometry args={[0.08, 0.55, 6, 12]} />
        <meshStandardMaterial color="#2E57A5" roughness={0.3} metalness={0.4} />
      </mesh>
      {/* Left leg */}
      <mesh position={[-0.15, -0.45, 0]}>
        <capsuleGeometry args={[0.1, 0.65, 6, 12]} />
        <meshStandardMaterial color="#2E57A5" roughness={0.3} metalness={0.4} />
      </mesh>
      {/* Right leg */}
      <mesh position={[0.15, -0.45, 0]}>
        <capsuleGeometry args={[0.1, 0.65, 6, 12]} />
        <meshStandardMaterial color="#2E57A5" roughness={0.3} metalness={0.4} />
      </mesh>
    </group>
  );
};

// GLB model loader component
const GltfModel = ({ url, scale = 1.5 }: { url: string; scale?: number }) => {
  const { scene } = useGLTF(url);
  const ref = useRef<THREE.Group>(null!);

  // Auto-center and scale the model
  useEffect(() => {
    if (ref.current) {
      const box = new THREE.Box3().setFromObject(ref.current);
      const center = new THREE.Vector3();
      box.getCenter(center);
      ref.current.position.sub(center);
      const size = new THREE.Vector3();
      box.getSize(size);
      const maxDim = Math.max(size.x, size.y, size.z);
      ref.current.scale.setScalar(scale / maxDim);
    }
  }, [url, scale]);

  return <primitive ref={ref} object={scene} />;
};

// Grid floor
const Floor = () => (
  <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.1, 0]} receiveShadow>
    <planeGeometry args={[10, 10]} />
    <meshStandardMaterial color="#1a1d23" roughness={1} />
  </mesh>
);

export const ThreeScene: React.FC<ThreeSceneProps> = ({ avatar, activeProduct }) => {
  const hasModel = !!avatar?.modelUrl;

  return (
    <div className="w-full h-full bg-[#151619] relative overflow-hidden rounded-2xl shadow-2xl border border-white/5">
      <Canvas
        shadows
        camera={{ position: [0, 0.5, 4], fov: 45 }}
        gl={{ antialias: true }}
        onCreated={({ gl }) => {
          gl.shadowMap.enabled = true;
          gl.shadowMap.type = THREE.PCFSoftShadowMap;
        }}
      >
        {/* Lighting */}
        <ambientLight intensity={0.5} />
        <directionalLight
          castShadow
          position={[5, 8, 5]}
          intensity={1.5}
          shadow-mapSize={[1024, 1024]}
        />
        <pointLight position={[-3, 3, -3]} intensity={0.6} color="#3AD4FF" />
        <pointLight position={[3, 1, 3]} intensity={0.4} color="#2E57A5" />

        <Environment preset="city" />

        <Suspense fallback={<AvatarPlaceholder />}>
          {hasModel ? (
            <GltfModel url={avatar!.modelUrl!} scale={2.2} />
          ) : (
            <AvatarPlaceholder />
          )}

          {/* Product garment overlay (placeholder box for now) */}
          {activeProduct && !activeProduct.modelUrl && (
            <mesh position={[0, 0.4, 0.32]} castShadow>
              <boxGeometry args={[0.72, 0.85, 0.05]} />
              <meshStandardMaterial color="#3AD4FF" transparent opacity={0.7} roughness={0.4} />
            </mesh>
          )}
          {activeProduct?.modelUrl && (
            <Suspense fallback={null}>
              <GltfModel url={activeProduct.modelUrl} scale={2.2} />
            </Suspense>
          )}
        </Suspense>

        <Floor />

        <OrbitControls
          enablePan={false}
          minPolarAngle={Math.PI / 4}
          maxPolarAngle={Math.PI / 1.6}
          minDistance={2}
          maxDistance={7}
          target={[0, 0.2, 0]}
        />
      </Canvas>

      {/* Status badges */}
      <div className="absolute top-4 left-4 flex flex-col gap-2 pointer-events-none">
        <div className="bg-black/40 backdrop-blur-md border border-white/10 px-3 py-1.5 rounded-full text-[10px] uppercase tracking-widest text-white/60 font-mono">
          System: Active
        </div>
        <div className="bg-black/40 backdrop-blur-md border border-white/10 px-3 py-1.5 rounded-full text-[10px] uppercase tracking-widest text-white/60 font-mono">
          Renderer: WebGL 2.0
        </div>
        {avatar && !hasModel && (
          <div className="bg-amber-500/20 border border-amber-400/30 px-3 py-1.5 rounded-full text-[10px] uppercase tracking-widest text-amber-300 font-mono animate-pulse">
            Generating 3D…
          </div>
        )}
        {hasModel && (
          <div className="bg-emerald-500/20 border border-emerald-400/30 px-3 py-1.5 rounded-full text-[10px] uppercase tracking-widest text-emerald-300 font-mono">
            Model Ready ✓
          </div>
        )}
      </div>

      {/* Bottom info bar */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex gap-4 pointer-events-none">
        <div className="bg-black/60 backdrop-blur-xl border border-white/10 px-6 py-3 rounded-2xl flex items-center gap-6">
          <div className="flex flex-col">
            <span className="text-[9px] uppercase tracking-tighter text-white/40 font-mono">View Mode</span>
            <span className="text-xs text-white font-medium">3D Interactive</span>
          </div>
          <div className="w-px h-8 bg-white/10" />
          <div className="flex flex-col">
            <span className="text-[9px] uppercase tracking-tighter text-white/40 font-mono">Lighting</span>
            <span className="text-xs text-white font-medium">Studio Neutral</span>
          </div>
        </div>
      </div>
    </div>
  );
};
