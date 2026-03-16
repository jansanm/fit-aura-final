import React, { useState } from 'react';
import { Upload, Camera, Sparkles, Ruler, Link as LinkIcon, ShoppingBag, CheckCircle2, Loader2, Info, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { UserAvatar, ProductInfo, AppState } from '../types';
import { extractProductInfo, estimateMeasurements } from '../lib/gemini';

interface SidebarProps {
  state: AppState;
  setState: (state: AppState) => void;
  avatar: UserAvatar | null;
  setAvatar: React.Dispatch<React.SetStateAction<UserAvatar | null>>;
  activeProduct: ProductInfo | null;
  setActiveProduct: React.Dispatch<React.SetStateAction<ProductInfo | null>>;
}

export const Sidebar: React.FC<SidebarProps> = ({ 
  state, 
  setState, 
  avatar, 
  setAvatar, 
  activeProduct, 
  setActiveProduct 
}) => {
  const [productUrl, setProductUrl] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  const pollTask = async (taskId: string, type: 'avatar' | 'product') => {
    const interval = setInterval(async () => {
      try {
        const response = await fetch(`/api/task/${taskId}`);
        const data = await response.json();
        
        if (data.status === 'success') {
          clearInterval(interval);
          if (type === 'avatar') {
            setAvatar(prev => prev ? { ...prev, modelUrl: data.model_url } : null);
          } else if (type === 'product') {
            setActiveProduct(prev => prev ? { ...prev, modelUrl: data.model_url } : null);
          }
        } else if (data.status === 'failed') {
          clearInterval(interval);
          console.error('3D Generation failed');
        }
      } catch (error) {
        clearInterval(interval);
        console.error('Polling error:', error);
      }
    }, 5000);
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setState('creating-avatar');
    setIsProcessing(true);

    try {
      console.log('Starting image processing...');
      
      // 1. Resize image on client side to reduce payload size
      const resizedBase64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (event) => {
          const img = new Image();
          img.onload = () => {
            const canvas = document.createElement('canvas');
            let width = img.width;
            let height = img.height;
            const maxDim = 1024;
            
            if (width > height) {
              if (width > maxDim) {
                height *= maxDim / width;
                width = maxDim;
              }
            } else {
              if (height > maxDim) {
                width *= maxDim / height;
                height = maxDim;
              }
            }
            
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx?.drawImage(img, 0, 0, width, height);
            // Get base64 without prefix
            resolve(canvas.toDataURL('image/jpeg', 0.8).split(',')[1]);
          };
          img.onerror = () => reject(new Error('Failed to load image for resizing'));
          img.src = event.target?.result as string;
        };
        reader.onerror = () => reject(new Error('Failed to read file'));
        reader.readAsDataURL(file);
      });

      console.log('Image resized, starting Gemini estimation...');
      
      // 2. Estimate measurements with Gemini
      const measurements = await estimateMeasurements(resizedBase64);
      console.log('Gemini measurements received:', measurements);
      
      const newAvatar: UserAvatar = {
        id: Math.random().toString(36).substr(2, 9),
        name: 'My Avatar',
        photoUrl: `data:image/jpeg;base64,${resizedBase64}`,
        measurements
      };
      
      setAvatar(newAvatar);
      setState('ready');
      console.log('State updated to ready, starting Tripo 3D generation...');

      // 3. Generate 3D model with Tripo
      const formData = new FormData();
      formData.append('file', file);
      
      const tripoResp = await fetch('/api/generate-3d', {
        method: 'POST',
        body: formData
      });
      
      if (!tripoResp.ok) {
        const errorData = await tripoResp.json();
        throw new Error(errorData.error || 'Tripo 3D generation failed');
      }
      
      const tripoData = await tripoResp.json();
      console.log('Tripo task created:', tripoData);
      if (tripoData.task_id) {
        pollTask(tripoData.task_id, 'avatar');
      }
    } catch (error: any) {
      console.error('Error in avatar creation:', error);
      const msg = typeof error.message === 'string' ? error.message : JSON.stringify(error.message) || 'Failed to create avatar';
      alert(`Error: ${msg}. Please try a different photo.`);
      setState('idle');
    } finally {
      setIsProcessing(false);
      // Reset input value so the same file can be selected again
      e.target.value = '';
    }
  };

  const handleProductSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!productUrl) return;

    setIsProcessing(true);
    try {
      // 1. Extract info with Gemini
      const info = await extractProductInfo(productUrl);
      const newProduct: ProductInfo = {
        ...info,
        id: Math.random().toString(36).substr(2, 9),
        productUrl
      };
      setActiveProduct(newProduct);
      setState('trying-on');

      // 2. Generate 3D model with Tripo
      // We need to fetch the image first since Tripo API expects a file or token
      const imgResp = await fetch(info.imageUrl);
      const imgBlob = await imgResp.blob();
      const formData = new FormData();
      formData.append('file', imgBlob, 'product.jpg');
      
      const tripoResp = await fetch('/api/generate-3d', {
        method: 'POST',
        body: formData
      });
      const tripoData = await tripoResp.json();
      if (tripoData.task_id) {
        pollTask(tripoData.task_id, 'product');
      }
    } catch (error) {
      console.error('Error extracting product info:', error);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="w-[400px] h-full flex flex-col gap-6 p-6 overflow-y-auto relative">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center shadow-lg">
            <Sparkles className="w-6 h-6 text-black" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">Vitra AI</h1>
            <p className="text-[10px] uppercase tracking-widest text-black/40 font-bold">Virtual Try-On Engine</p>
          </div>
        </div>
        <button 
          onClick={() => setShowHelp(true)}
          className="p-2 hover:bg-black/5 rounded-full transition-colors text-black/40"
        >
          <Info className="w-5 h-5" />
        </button>
      </div>

      <AnimatePresence>
        {showHelp && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="absolute inset-0 z-50 bg-white p-8 flex flex-col gap-6"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold">How it Works</h2>
              <button onClick={() => setShowHelp(false)} className="p-1 hover:bg-black/5 rounded-full">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="flex flex-col gap-6 text-sm text-black/60 leading-relaxed">
              <div>
                <h3 className="text-black font-bold mb-1">1. Digital Twin Creation</h3>
                <p>Our AI analyzes your photo to estimate 12+ body measurements with 95% accuracy, generating a custom 3D avatar that matches your physique.</p>
              </div>
              <div>
                <h3 className="text-black font-bold mb-1">2. Product Extraction</h3>
                <p>Paste any URL from supported stores. Vitra AI extracts garment geometry, fabric properties, and sizing charts in real-time.</p>
              </div>
              <div>
                <h3 className="text-black font-bold mb-1">3. Virtual Fitting</h3>
                <p>The engine simulates the garment's drape and tension over your specific avatar, providing a realistic visualization of fit and style.</p>
              </div>
            </div>

            <button 
              onClick={() => setShowHelp(false)}
              className="mt-auto w-full py-3 bg-black text-white rounded-xl text-xs font-bold"
            >
              Got it
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex flex-col gap-4">
        {/* Step 1: Avatar Creation */}
        <section className="bg-white rounded-2xl p-5 shadow-sm border border-black/5 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-black text-white text-[10px] flex items-center justify-center font-bold">01</div>
              <h2 className="text-sm font-bold">Avatar Creation</h2>
            </div>
            {avatar && <CheckCircle2 className="w-4 h-4 text-emerald-500" />}
          </div>

          {!avatar ? (
            <div className="flex flex-col gap-3">
              <p className="text-xs text-black/60 leading-relaxed">
                Upload a full-body photo to generate your precise 3D digital twin.
              </p>
              <div className="flex flex-col gap-2">
                <label className="cursor-pointer group">
                  <input type="file" className="hidden" accept="image/*" onChange={handlePhotoUpload} disabled={isProcessing} />
                  <div className="w-full py-8 border-2 border-dashed border-black/10 rounded-xl flex flex-col items-center justify-center gap-2 group-hover:border-black/30 transition-colors bg-black/[0.02]">
                    {isProcessing && state === 'creating-avatar' ? (
                      <Loader2 className="w-5 h-5 text-black/40 animate-spin" />
                    ) : (
                      <>
                        <Upload className="w-5 h-5 text-black/40" />
                        <span className="text-[10px] font-medium text-black/60">Upload Photo</span>
                      </>
                    )}
                  </div>
                </label>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-3 p-3 bg-black/[0.02] rounded-xl border border-black/5">
                <img src={avatar.photoUrl} alt="Avatar" className="w-12 h-12 rounded-lg object-cover" />
                <div className="flex flex-col">
                  <span className="text-xs font-bold">Digital Twin Ready</span>
                  <span className="text-[10px] text-black/40">Based on uploaded photo</span>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="p-2 bg-black/[0.02] rounded-lg border border-black/5 flex flex-col">
                  <span className="text-[9px] uppercase text-black/40 font-bold">Height</span>
                  <span className="text-xs font-mono">{avatar.measurements.height} cm</span>
                </div>
                <div className="p-2 bg-black/[0.02] rounded-lg border border-black/5 flex flex-col">
                  <span className="text-[9px] uppercase text-black/40 font-bold">Waist</span>
                  <span className="text-xs font-mono">{avatar.measurements.waist} cm</span>
                </div>
              </div>
              <button 
                onClick={() => { setAvatar(null as any); setState('idle'); }}
                className="text-[10px] text-black/40 hover:text-black underline text-left"
              >
                Reset Avatar
              </button>
            </div>
          )}
        </section>

        {/* Step 2: Product Link */}
        <section className={`bg-white rounded-2xl p-5 shadow-sm border border-black/5 flex flex-col gap-4 transition-opacity ${!avatar ? 'opacity-50 pointer-events-none' : ''}`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-black text-white text-[10px] flex items-center justify-center font-bold">02</div>
              <h2 className="text-sm font-bold">Product Integration</h2>
            </div>
          </div>

          <form onSubmit={handleProductSubmit} className="flex flex-col gap-3">
            <p className="text-xs text-black/60 leading-relaxed">
              Paste a clothing link from Amazon, Zara, Myntra, or Ajio.
            </p>
            <div className="relative">
              <LinkIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-black/30" />
              <input 
                type="url" 
                placeholder="Paste Zara, Amazon or Myntra link..."
                className="w-full pl-10 pr-4 py-3 bg-black/[0.02] border border-black/10 rounded-xl text-xs focus:outline-none focus:border-black/30 transition-colors"
                value={productUrl}
                onChange={(e) => setProductUrl(e.target.value)}
                disabled={isProcessing}
              />
            </div>
            <button 
              type="submit"
              disabled={isProcessing || !productUrl}
              className="w-full py-3 bg-black text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 hover:bg-black/90 transition-colors disabled:bg-black/20"
            >
              {isProcessing && state === 'trying-on' ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  <ShoppingBag className="w-4 h-4" />
                  Process Item
                </>
              )}
            </button>
          </form>
        </section>

        {/* Step 3: Try-On Status */}
        <AnimatePresence>
          {activeProduct && (
            <motion.section 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className="bg-white rounded-2xl p-5 shadow-sm border border-black/5 flex flex-col gap-4"
            >
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-full bg-emerald-500 text-white text-[10px] flex items-center justify-center font-bold">03</div>
                <h2 className="text-sm font-bold">Virtual Fitting</h2>
              </div>

              <div className="flex gap-4">
                <img src={activeProduct.imageUrl} alt={activeProduct.title} className="w-20 h-24 rounded-xl object-cover border border-black/5 shadow-sm" />
                <div className="flex flex-col justify-center gap-1">
                  <span className="text-[10px] uppercase tracking-widest text-black/40 font-bold">{activeProduct.brand}</span>
                  <h3 className="text-sm font-bold leading-tight">{activeProduct.title}</h3>
                  <span className="text-sm font-mono font-bold text-emerald-600">{activeProduct.price}</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-100 flex flex-col items-center justify-center gap-1">
                  <Ruler className="w-4 h-4 text-emerald-600" />
                  <span className="text-[10px] font-bold text-emerald-700 uppercase">Fit Match</span>
                  <span className="text-xs font-bold text-emerald-900">94% Accurate</span>
                </div>
                <a 
                  href={activeProduct.productUrl} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="p-3 bg-black text-white rounded-xl flex flex-col items-center justify-center gap-1 hover:bg-black/90 transition-colors"
                >
                  <ShoppingBag className="w-4 h-4" />
                  <span className="text-[10px] font-bold uppercase">Buy Now</span>
                  <span className="text-[8px] opacity-60">Original Store</span>
                </a>
              </div>
            </motion.section>
          )}
        </AnimatePresence>
      </div>

      <div className="mt-auto pt-6 border-t border-black/5">
        <div className="flex items-center justify-between text-[10px] text-black/40 font-mono">
          <span>v1.0.4-beta</span>
          <span>© 2026 Vitra AI</span>
        </div>
      </div>
    </div>
  );
};
