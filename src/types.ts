export interface UserAvatar {
  id: string;
  name: string;
  photoUrl?: string;
  modelUrl?: string; // URL to the 3D model (GLB/GLTF)
  measurements: {
    height: number;
    chest: number;
    waist: number;
    hips: number;
  };
}

export interface ProductInfo {
  id: string;
  title: string;
  brand: string;
  price: string;
  imageUrl: string;
  productUrl: string;
  category: 'top' | 'bottom' | 'full' | 'shoes';
  modelUrl?: string; // URL to the 3D garment model
}

export type AppState = 'idle' | 'creating-avatar' | 'ready' | 'trying-on';
