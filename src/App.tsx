/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from 'react';
import { Sidebar } from './components/Sidebar';
import { ThreeScene } from './components/ThreeScene';
import { ErrorBoundary } from './components/ErrorBoundary';
import { UserAvatar, ProductInfo, AppState } from './types';
import { motion } from 'motion/react';

export default function App() {
  const [state, setState] = useState<AppState>('idle');
  const [avatar, setAvatar] = useState<UserAvatar | null>(null);
  const [activeProduct, setActiveProduct] = useState<ProductInfo | null>(null);

  return (
    <div className="flex h-screen w-full bg-[#F5F5F7] text-[#1D1D1F] overflow-hidden font-sans">
      {/* Sidebar Controls */}
      <ErrorBoundary>
        <Sidebar 
          state={state}
          setState={setState}
          avatar={avatar}
          setAvatar={setAvatar}
          activeProduct={activeProduct}
          setActiveProduct={setActiveProduct}
        />
      </ErrorBoundary>

      {/* Main 3D Workspace */}
      <main className="flex-1 p-6 relative">
        <div className="w-full h-full relative group">
          <ErrorBoundary fallback={
            <div className="w-full h-full bg-[#151619] rounded-2xl flex items-center justify-center">
              <div className="text-center p-8 bg-black/40 backdrop-blur-xl border border-white/10 rounded-2xl max-w-md">
                <h2 className="text-white font-bold mb-2">3D Engine Error</h2>
                <p className="text-white/60 text-xs mb-4">The 3D renderer encountered an issue. This might be due to WebGL compatibility or a model loading error.</p>
                <button onClick={() => window.location.reload()} className="px-4 py-2 bg-white text-black rounded-xl text-xs font-bold">Restart Engine</button>
              </div>
            </div>
          }>
            <ThreeScene 
              avatar={avatar}
              activeProduct={activeProduct}
            />
          </ErrorBoundary>
        </div>
      </main>
    </div>
  );
}

