'use client';

import { useState, useRef, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';

interface FormationPickerProps {
  formations: string[];
  current: string;
  onChange: (f: string) => void;
}

function parseFormation(f: string): { def: number; mid: number; fwd: number } {
  const parts = f.split('-').map(Number);
  const def = parts[0];
  const fwd = parts[parts.length - 1];
  const mid = 10 - def - fwd;
  return { def, mid, fwd };
}

function FormationDots({ formation }: { formation: string }) {
  const { def, mid, fwd } = parseFormation(formation);
  const rows: { count: number; color: string }[] = [
    { count: fwd, color: 'bg-rose-400' },
    { count: mid, color: 'bg-emerald-400' },
    { count: def, color: 'bg-sky-400' },
    { count: 1, color: 'bg-amber-400' },
  ];
  return (
    <div className="flex flex-col items-center gap-[3px] w-7 h-9 justify-center">
      {rows.map((row, i) => (
        <div key={i} className="flex gap-[3px]">
          {Array.from({ length: row.count }).map((_, j) => (
            <span key={j} className={`w-[5px] h-[5px] rounded-full ${row.color}`} />
          ))}
        </div>
      ))}
    </div>
  );
}

export default function FormationPicker({ formations, current, onChange }: FormationPickerProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="group flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/10 border border-white/20 text-white text-sm font-bold hover:bg-white/15 hover:border-white/30 transition-all"
      >
        <FormationDots formation={current} />
        <span className="tracking-wider">{current}</span>
        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div
          className="absolute top-full mt-2 right-0 z-50 p-2 rounded-xl bg-slate-900/95 backdrop-blur-md border border-white/15 shadow-2xl animate-fade-in max-h-[70vh] overflow-y-auto"
          style={{ width: 'min(18rem, calc(100vw - 24px))' }}
        >
          <p className="px-2 pt-1 pb-2 text-[10px] font-bold text-white/40 uppercase tracking-wider">Choose Formation</p>
          <div className="grid grid-cols-3 gap-1.5">
            {formations.map(f => {
              const active = f === current;
              return (
                <button
                  key={f}
                  onClick={() => { onChange(f); setOpen(false); }}
                  className={`flex flex-col items-center gap-1 p-2 rounded-lg border transition-all ${
                    active
                      ? 'bg-emerald-500/15 border-emerald-500/60 ring-1 ring-emerald-500/40'
                      : 'bg-white/5 border-white/5 hover:border-white/20 hover:bg-white/10'
                  }`}
                >
                  <FormationDots formation={f} />
                  <span className={`text-[11px] font-bold ${active ? 'text-emerald-400' : 'text-white/80'}`}>{f}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
