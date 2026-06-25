import { createContext, useContext, useEffect, ReactNode } from 'react';
import { useAuth } from './AuthContext';
import { supabase } from '../lib/supabase';

interface FontSizeContextValue {
  fontSize: number;
  setFontSize: (size: number) => Promise<void>;
}

const FontSizeContext = createContext<FontSizeContextValue | null>(null);

const MIN_FONT_SIZE = 0.75;
const MAX_FONT_SIZE = 1.5;

export function FontSizeProvider({ children }: { children: ReactNode }) {
  const { profile, refreshProfile } = useAuth();
  const fontSize = profile?.font_size ?? 1.0;

  useEffect(() => {
    const clampedSize = Math.max(MIN_FONT_SIZE, Math.min(MAX_FONT_SIZE, fontSize));
    document.documentElement.style.setProperty('--app-font-scale', String(clampedSize));
    document.documentElement.style.fontSize = `${clampedSize * 16}px`;
  }, [fontSize]);

  async function setFontSize(size: number) {
    const clampedSize = Math.max(MIN_FONT_SIZE, Math.min(MAX_FONT_SIZE, size));
    if (!profile) return;

    const { error } = await supabase
      .from('profiles')
      .update({ font_size: clampedSize, updated_at: new Date().toISOString() })
      .eq('id', profile.id);

    if (!error) {
      await refreshProfile();
    }
  }

  return (
    <FontSizeContext.Provider value={{ fontSize, setFontSize }}>
      {children}
    </FontSizeContext.Provider>
  );
}

export function useFontSize() {
  const ctx = useContext(FontSizeContext);
  if (!ctx) throw new Error('useFontSize must be used within FontSizeProvider');
  return ctx;
}
