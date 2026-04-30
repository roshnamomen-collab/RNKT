/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  ChevronLeft, 
  ChevronRight, 
  Plus, 
  RotateCcw, 
  X, 
  Languages, 
  LayoutGrid, 
  LayoutList,
  CheckCircle2,
  Info,
  LogIn,
  LogOut,
  User as UserIcon,
  Trash2,
  Database
} from 'lucide-react';
import { auth, db, signInWithGoogle } from './lib/firebase';
import { 
  onAuthStateChanged, 
  User, 
  signOut 
} from 'firebase/auth';
import { 
  collection, 
  addDoc, 
  onSnapshot, 
  query, 
  orderBy, 
  serverTimestamp, 
  doc, 
  deleteDoc,
  Timestamp 
} from 'firebase/firestore';

// --- Types ---

type Language = 'ottoman' | 'sorani' | 'turkish';
type LayoutMode = 'side-by-side' | 'stacked';

interface WordMap {
  ottoman: number | null;
  sorani: number | null;
  turkish: number | null;
}

interface Sentence {
  id: string; // Firestore Document ID
  ottoman: string[];
  sorani: string[];
  turkish: string[];
  wordMap: WordMap[];
  authorId: string;
  createdAt: Timestamp;
}

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

// --- Error Handling ---

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// --- Constants ---

const DEFAULT_SENTENCES_MOCK: any[] = [
  {
    ottoman: ["بو", "کتاب", "چوق", "گوزل", "در"],
    sorani:  ["ئەم", "کتێب", "زۆر", "جوان", "ە"],
    turkish: ["bu", "kitap", "çok", "güzel", "dir"],
    wordMap: [
      { ottoman: 0, sorani: 0, turkish: 0 },
      { ottoman: 1, sorani: 1, turkish: 1 },
      { ottoman: 2, sorani: 2, turkish: 2 },
      { ottoman: 3, sorani: 3, turkish: 3 },
      { ottoman: 4, sorani: 4, turkish: 4 },
    ]
  },
  {
    ottoman: ["آدم", "سو", "ایچر", "و", "اکمک", "یر"],
    sorani:  ["مرۆڤ", "ئاو", "دەخوات", "و", "نان", "دەخوات"],
    turkish: ["insan", "su", "içer", "ve", "ekmek", "yer"],
    wordMap: [
      { ottoman: 0, sorani: 0, turkish: 0 },
      { ottoman: 1, sorani: 1, turkish: 1 },
      { ottoman: 2, sorani: 2, turkish: 2 },
      { ottoman: 3, sorani: 3, turkish: 3 },
      { ottoman: 4, sorani: 4, turkish: 4 },
      { ottoman: 5, sorani: 5, turkish: 5 },
    ]
  }
];

const LANG_META: Record<Language, { label: string; sub: string; color: string; rtl: boolean }> = {
  ottoman: { label: "Ottoman", sub: "Osmanlı Türkçesi", color: "bg-indigo-600", rtl: true },
  sorani:  { label: "Sorani",  sub: "کوردیی سۆرانی", color: "bg-emerald-600", rtl: true },
  turkish: { label: "Turkish", sub: "Modern Türkçe", color: "bg-red-600", rtl: false },
};

// --- Components ---

export default function App() {
  const [sentences, setSentences] = useState<Sentence[]>([]);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const [currentIndex, setCurrentIndex] = useState(0);
  const [layoutMode, setLayoutMode] = useState<LayoutMode>('side-by-side');
  const [visibleLangs, setVisibleLangs] = useState<Language[]>(['ottoman', 'sorani', 'turkish']);
  const [showCMS, setShowCMS] = useState(false);
  const [showSavedToast, setShowSavedToast] = useState(false);
  
  // Interaction State
  const [activeHighlight, setActiveHighlight] = useState<{ lang: Language; index: number } | null>(null);
  const [popupPos, setPopupPos] = useState({ top: 0, left: 0 });

  const currentSentence = sentences[currentIndex] || null;

  // Auth Listener
  useEffect(() => {
    return onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
  }, []);

  // Firestore Listener
  useEffect(() => {
    const q = query(collection(db, 'sentences'), orderBy('createdAt', 'asc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Sentence[];
      setSentences(data);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'sentences');
    });
    return () => unsubscribe();
  }, []);

  // Keyboard Navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') return;

      if (e.key === 'ArrowLeft') {
        setCurrentIndex(prev => Math.max(0, prev - 1));
        clearInteraction();
      } else if (e.key === 'ArrowRight') {
        setCurrentIndex(prev => Math.min(sentences.length - 1, prev + 1));
        clearInteraction();
      } else if (e.key === 'Escape') {
        clearInteraction();
        setShowCMS(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [sentences.length]);

  const clearInteraction = useCallback(() => {
    setActiveHighlight(null);
  }, []);

  const handleWordClick = (lang: Language, index: number, e: React.MouseEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setPopupPos({
      top: rect.bottom + window.scrollY + 12,
      left: rect.left + rect.width / 2 - 110,
    });
    setActiveHighlight({ lang, index });
  };

  const currentMapEntry = useMemo(() => {
    if (!activeHighlight || !currentSentence) return null;
    return currentSentence.wordMap.find(m => m[activeHighlight.lang] === activeHighlight.index);
  }, [activeHighlight, currentSentence]);

  const toggleLang = (lang: Language) => {
    setVisibleLangs(prev => 
      prev.includes(lang) ? prev.filter(l => l !== lang) : [...prev, lang]
    );
  };

  const seedData = async () => {
    if (!user) {
      alert("Please sign in to seed data.");
      return;
    }
    if (confirm("Populate database with default entries?")) {
      for (const s of DEFAULT_SENTENCES_MOCK) {
        try {
          await addDoc(collection(db, 'sentences'), {
            ...s,
            authorId: user.uid,
            createdAt: serverTimestamp()
          });
        } catch (error) {
          handleFirestoreError(error, OperationType.CREATE, 'sentences');
        }
      }
    }
  };

  const deleteCurrentEntry = async () => {
    if (!currentSentence || !user) return;
    if (currentSentence.authorId !== user.uid) {
      alert("You can only delete your own entries.");
      return;
    }
    if (confirm("Delete this entry forever?")) {
      try {
        await deleteDoc(doc(db, 'sentences', currentSentence.id));
        if (currentIndex >= sentences.length - 1 && currentIndex > 0) {
          setCurrentIndex(currentIndex - 1);
        }
      } catch (error) {
        handleFirestoreError(error, OperationType.DELETE, `sentences/${currentSentence.id}`);
      }
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <motion.div 
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
          className="w-12 h-12 border-4 border-slate-200 border-t-slate-900 rounded-full"
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans p-4 md:p-8 flex items-center justify-center">
      <div className="w-full max-w-6xl bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden" id="app-container">
        {/* Header */}
        <header className="p-6 bg-slate-100/50 border-bottom border-slate-200">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="flex items-center gap-4">
              <div>
                <h1 className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-1">Philological Parallel Corpus</h1>
                <h2 className="text-xl font-semibold text-slate-800">Trilingual Project</h2>
              </div>
              
              {/* Auth Controls */}
              <div className="flex items-center gap-2 ml-4 pl-4 border-l border-slate-200">
                {user ? (
                  <div className="flex items-center gap-3">
                    <img src={user.photoURL || ''} alt="User" className="w-8 h-8 rounded-full border border-slate-200 shadow-sm" />
                    <div className="hidden sm:block">
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">Contributor</p>
                      <p className="text-xs font-semibold text-slate-700 max-w-[100px] truncate">{user.displayName}</p>
                    </div>
                    <button 
                      onClick={() => signOut(auth)}
                      className="p-2 hover:bg-slate-200 rounded-lg text-slate-400 hover:text-slate-900 transition-all"
                      title="Sign Out"
                    >
                      <LogOut className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <button 
                    onClick={signInWithGoogle}
                    className="flex items-center gap-2 px-4 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-700 hover:border-slate-400 transition-all shadow-sm"
                  >
                    <LogIn className="w-3.5 h-3.5" />
                    Sign In
                  </button>
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-2 bg-white p-1 rounded-lg border border-slate-200 shadow-sm">
                <LayoutGrid className="w-4 h-4 text-slate-400 ml-2" />
                {(['side-by-side', 'stacked'] as const).map(mode => (
                  <button
                    key={mode}
                    onClick={() => setLayoutMode(mode)}
                    aria-label={`Switch to ${mode} view`}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                      layoutMode === mode 
                        ? 'bg-slate-900 text-white shadow-md' 
                        : 'text-slate-500 hover:bg-slate-100'
                    }`}
                  >
                    {mode === 'side-by-side' ? 'Parallel' : 'Vertical'}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-2 bg-white p-1 rounded-lg border border-slate-200 shadow-sm">
                <Languages className="w-4 h-4 text-slate-400 ml-2" />
                {(['ottoman', 'sorani', 'turkish'] as const).map(lang => (
                  <button
                    key={lang}
                    onClick={() => toggleLang(lang)}
                    aria-label={`Toggle ${LANG_META[lang].label}`}
                    className={`group px-3 py-1.5 text-xs font-medium rounded-md transition-all flex items-center gap-2 ${
                      visibleLangs.includes(lang) 
                        ? 'bg-slate-100 text-slate-900 border border-slate-200' 
                        : 'text-slate-400 grayscale opacity-60 hover:opacity-100'
                    }`}
                  >
                    <span className={`w-2 h-2 rounded-full ${LANG_META[lang].color}`} />
                    {LANG_META[lang].label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </header>

        {/* Content Area */}
        <main className="p-6 min-h-[400px] relative">
          <AnimatePresence mode="wait">
            {sentences.length > 0 ? (
              <motion.div
                key={currentIndex}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
                className={`grid gap-6 ${layoutMode === 'side-by-side' ? 'md:grid-cols-3' : 'grid-cols-1'}`}
                onPointerDown={(e) => {
                  if (!(e.target as HTMLElement).closest('.word')) clearInteraction();
                }}
              >
                {Object.entries(LANG_META).map(([langKey, meta], idx) => {
                  const lang = langKey as Language;
                  if (!visibleLangs.includes(lang)) return null;

                  const words = currentSentence[lang];
                  const isRTL = meta.rtl;

                  return (
                    <motion.div
                      key={lang}
                      initial={{ opacity: 0, scale: 0.98 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: idx * 0.1 }}
                      className="flex flex-col bg-slate-50/50 rounded-xl border border-slate-200 overflow-hidden hover:shadow-md transition-shadow"
                    >
                      <div className="px-4 py-3 bg-white border-b border-slate-200 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className={`w-1 h-4 rounded-full ${meta.color}`} />
                          <span className="text-sm font-semibold text-slate-700">{meta.label}</span>
                        </div>
                        <span className="text-[10px] uppercase font-bold text-slate-300 tracking-wider font-mono">{meta.sub}</span>
                      </div>
                      <div 
                        className={`p-6 md:p-8 flex-1 ${isRTL ? 'text-right' : 'text-left'}`}
                        dir={isRTL ? 'rtl' : 'ltr'}
                      >
                        <div className="flex flex-wrap gap-x-1 gap-y-2">
                          {words.map((word, wordIdx) => {
                            const isClicked = activeHighlight?.lang === lang && activeHighlight?.index === wordIdx;
                            const isLinked = currentMapEntry && currentMapEntry[lang] === wordIdx && !isClicked;

                            return (
                              <button
                                key={wordIdx}
                                onClick={(e) => handleWordClick(lang, wordIdx, e)}
                                className={`word relative px-1 py-0.5 rounded-md transition-all cursor-pointer select-none outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2
                                  ${isRTL ? 'font-serif text-2xl leading-relaxed' : 'font-serif text-xl'}
                                  ${isClicked ? 'bg-amber-100 ring-2 ring-amber-400 text-slate-900 z-10' : ''}
                                  ${isLinked ? 'bg-amber-50/80 ring-1 ring-amber-200/50 text-slate-900' : 'text-slate-700 hover:bg-slate-200/50'}
                                `}
                              >
                                {word || '—'}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                      {currentSentence.authorId === user?.uid && (
                        <div className="px-4 py-2 bg-white/50 border-t border-slate-100 text-[9px] font-bold text-slate-400 flex items-center justify-between">
                          <span>YOUR ENTRY</span>
                          <span>ID: {currentSentence.id.slice(0, 6)}</span>
                        </div>
                      )}
                    </motion.div>
                  );
                })}
              </motion.div>
            ) : (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex flex-col items-center justify-center py-20 text-center"
              >
                <div className="p-4 bg-slate-100 rounded-full mb-4">
                  <Database className="w-12 h-12 text-slate-300" />
                </div>
                <h3 className="text-lg font-bold text-slate-800">No Entries Found</h3>
                <p className="text-sm text-slate-500 max-w-xs mt-2">The database is currently empty. Be the first to add a trilingual sentence pair!</p>
                {user && (
                  <button 
                    onClick={seedData}
                    className="mt-6 flex items-center gap-2 px-6 py-2 bg-slate-200 text-slate-700 rounded-lg text-sm font-bold hover:bg-slate-300 transition-all"
                  >
                    <RotateCcw className="w-4 h-4" />
                    Seed Defaults
                  </button>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Word Popup */}
          <AnimatePresence>
            {activeHighlight && (
              <motion.div
                initial={{ opacity: 0, scale: 0.92, y: 5 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.92, y: 5 }}
                className="fixed z-[100] w-64 bg-white rounded-xl shadow-2xl border border-slate-900 p-4 pointer-events-none"
                style={{ top: popupPos.top, left: popupPos.left }}
              >
                <div className="mb-3 pb-2 border-b border-slate-100 flex items-center justify-between">
                  <span className="text-[10px] font-black uppercase tracking-tighter text-slate-400">Lexical Cross-Ref</span>
                  <Info className="w-3 h-3 text-slate-300" />
                </div>
                <div className="space-y-3">
                  {Object.entries(LANG_META).map(([langKey, meta]) => {
                    const l = langKey as Language;
                    if (l === activeHighlight.lang) return null;
                    const linkedIdx = currentMapEntry ? currentMapEntry[l] : null;
                    const linkedWord = linkedIdx !== null ? currentSentence[l][linkedIdx] : '—';
                    
                    return (
                      <div key={l} className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-2">
                          <div className={`w-1.5 h-1.5 rounded-full ${meta.color}`} />
                          <span className="text-[10px] font-bold text-slate-500 uppercase">{meta.label}</span>
                        </div>
                        <span className={`text-sm font-semibold text-slate-800 ${meta.rtl ? 'font-serif text-lg text-right' : ''}`}>
                          {linkedWord}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </main>

        {/* Navigation */}
        <footer className="p-6 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <button
              onClick={() => { setCurrentIndex(prev => Math.max(0, prev - 1)); clearInteraction(); }}
              disabled={currentIndex === 0}
              aria-label="Previous sentence"
              className="p-3 rounded-full bg-white border border-slate-200 shadow-sm text-slate-600 disabled:opacity-30 disabled:cursor-not-allowed hover:border-slate-400 hover:text-slate-900 transition-all active:scale-90"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <div className="flex flex-col items-center min-w-[80px]">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Entry</span>
              <span className="text-lg font-black text-slate-800 tabular-nums">{currentIndex + 1} / {sentences.length}</span>
            </div>
            <button
              onClick={() => { setCurrentIndex(prev => Math.min(sentences.length - 1, prev + 1)); clearInteraction(); }}
              disabled={currentIndex === sentences.length - 1}
              aria-label="Next sentence"
              className="p-3 rounded-full bg-white border border-slate-200 shadow-sm text-slate-600 disabled:opacity-30 disabled:cursor-not-allowed hover:border-slate-400 hover:text-slate-900 transition-all active:scale-90"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>

          <div className="flex items-center gap-3">
            {user ? (
              <button 
                onClick={() => setShowCMS(true)}
                className="flex items-center gap-2 px-6 py-2.5 bg-slate-900 text-white rounded-full text-sm font-bold shadow-lg shadow-slate-200 hover:bg-slate-800 transition-all active:scale-95"
              >
                <Plus className="w-4 h-4" />
                Add Entry
              </button>
            ) : (
              <button 
                onClick={signInWithGoogle}
                className="flex items-center gap-2 px-6 py-2.5 bg-indigo-600 text-white rounded-full text-sm font-bold shadow-lg shadow-indigo-200 hover:bg-indigo-700 transition-all active:scale-95"
              >
                <LogIn className="w-4 h-4" />
                Sign In to Add
              </button>
            )}
            
            {currentSentence && currentSentence.authorId === user?.uid && (
              <button 
                onClick={deleteCurrentEntry}
                aria-label="Delete current entry"
                className="p-2.5 rounded-full bg-white border border-slate-200 text-slate-400 hover:text-red-600 hover:border-red-200 transition-all"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
            
            <AnimatePresence>
              {showSavedToast && (
                <motion.div
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  className="flex items-center gap-2 text-emerald-600 font-bold text-sm"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  Synced
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </footer>
      </div>

      {/* CMS Modal */}
      <AnimatePresence>
        {showCMS && user && (
          <CMSModal 
            user={user}
            onClose={() => setShowCMS(false)} 
            onSave={async (newEntryData) => {
              try {
                await addDoc(collection(db, 'sentences'), {
                  ...newEntryData,
                  authorId: user.uid,
                  createdAt: serverTimestamp()
                });
                setShowCMS(false);
                setShowSavedToast(true);
                setTimeout(() => setShowSavedToast(false), 2000);
              } catch (error) {
                handleFirestoreError(error, OperationType.CREATE, 'sentences');
              }
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// --- CMS Modal Component ---

interface CMSModalProps {
  user: User;
  onClose: () => void;
  onSave: (data: Omit<Sentence, 'id' | 'authorId' | 'createdAt'>) => Promise<void>;
}

function CMSModal({ user, onClose, onSave }: CMSModalProps) {
  const [inputs, setInputs] = useState<Record<Language, string>>({
    ottoman: '',
    sorani: '',
    turkish: ''
  });
  const [wordMaps, setWordMaps] = useState<WordMap[]>([{ ottoman: null, sorani: null, turkish: null }]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const tokens = useMemo(() => {
    return {
      ottoman: inputs.ottoman.trim().split(/\s+/).filter(Boolean),
      sorani: inputs.sorani.trim().split(/\s+/).filter(Boolean),
      turkish: inputs.turkish.trim().split(/\s+/).filter(Boolean)
    };
  }, [inputs]);

  const handleSave = async () => {
    if (!tokens.ottoman.length || !tokens.sorani.length || !tokens.turkish.length) {
      setError("Please provide text for all three languages.");
      return;
    }
    
    setSaving(true);
    try {
      await onSave({
        ottoman: tokens.ottoman,
        sorani: tokens.sorani,
        turkish: tokens.turkish,
        wordMap: wordMaps.filter(m => m.ottoman !== null || m.sorani !== null || m.turkish !== null)
      });
    } catch (err) {
      setError("Failed to save entry.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[1000] bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        onClick={e => e.stopPropagation()}
        className="w-full max-w-2xl bg-white rounded-2xl shadow-2xl p-8 max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <UserIcon className="w-5 h-5 text-indigo-500" />
            <h2 className="text-xl font-bold text-slate-800">Add New Parallel Entry</h2>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full transition-all">
            <X className="w-6 h-6 text-slate-400" />
          </button>
        </div>

        <div className="space-y-6">
          {(['ottoman', 'sorani', 'turkish'] as Language[]).map(lang => (
            <div key={lang} className="space-y-2">
              <label className="text-xs font-black uppercase text-slate-400 tracking-wider">
                {LANG_META[lang].label}
              </label>
              <textarea
                value={inputs[lang]}
                onChange={e => setInputs(prev => ({ ...prev, [lang]: e.target.value }))}
                dir={LANG_META[lang].rtl ? 'rtl' : 'ltr'}
                className={`w-full p-4 rounded-xl border border-slate-200 focus:ring-2 focus:ring-slate-900 focus:border-transparent outline-none transition-all resize-none
                  ${LANG_META[lang].rtl ? 'font-serif text-xl' : 'text-sm font-medium'}
                `}
                rows={2}
                placeholder={`Enter ${LANG_META[lang].label} text here...`}
              />
              <div className="flex flex-wrap gap-2 pt-1">
                {tokens[lang].map((t, i) => (
                  <span key={i} className="px-2 py-1 bg-slate-100 text-[10px] font-bold text-slate-500 rounded border border-slate-200">
                    <span className="text-slate-300 mr-1">{i}</span> {t}
                  </span>
                ))}
              </div>
            </div>
          ))}

          <div className="pt-8 border-t border-slate-100">
            <h3 className="text-sm font-bold text-slate-800 mb-4 flex items-center gap-2">
              Word Mappings
              <span className="text-[10px] font-medium text-slate-400 px-2 py-0.5 bg-slate-50 border border-slate-200 rounded">Manual Alignment</span>
            </h3>
            
            <div className="space-y-3">
              {wordMaps.map((map, i) => (
                <div key={i} className="flex flex-wrap items-center gap-3 p-3 bg-slate-50 rounded-lg border border-slate-200">
                  {Object.entries(LANG_META).map(([langKey]) => {
                    const l = langKey as Language;
                    return (
                      <div key={l} className="flex items-center gap-2">
                        <span className="text-[10px] font-black text-slate-400 uppercase w-12">{l.slice(0,3)}</span>
                        <input
                          type="number"
                          placeholder="Idx"
                          value={map[l] ?? ''}
                          onChange={e => {
                            const val = e.target.value === '' ? null : parseInt(e.target.value);
                            setWordMaps(prev => {
                              const next = [...prev];
                              next[i] = { ...next[i], [l]: val };
                              return next;
                            });
                          }}
                          className="w-16 p-1.5 text-xs border border-slate-200 rounded bg-white"
                        />
                      </div>
                    );
                  })}
                  <button 
                    onClick={() => setWordMaps(prev => prev.filter((_, idx) => idx !== i))}
                    className="ml-auto p-1.5 text-slate-300 hover:text-red-500 transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
            
            <button 
              onClick={() => setWordMaps(prev => [...prev, { ottoman: null, sorani: null, turkish: null }])}
              className="mt-4 w-full py-2.5 border-2 border-dashed border-slate-200 rounded-xl text-slate-400 text-xs font-bold hover:border-slate-400 hover:text-slate-600 transition-all uppercase tracking-widest"
            >
              + Add Map Row
            </button>
          </div>

          {error && (
            <p className="text-red-500 text-xs font-bold text-center mt-4">{error}</p>
          )}

          <div className="flex gap-4 pt-8">
            <button 
              onClick={onClose}
              disabled={saving}
              className="flex-1 py-4 text-sm font-bold text-slate-500 hover:bg-slate-50 rounded-xl transition-all disabled:opacity-50"
            >
              Cancel
            </button>
            <button 
              onClick={handleSave}
              disabled={saving}
              className="flex-[2] py-4 bg-slate-900 text-white rounded-xl text-sm font-bold shadow-xl shadow-slate-200 hover:bg-slate-800 transition-all active:scale-[0.98] flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {saving ? (
                <motion.div 
                  animate={{ rotate: 360 }}
                  transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
                  className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full"
                />
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  Save Sentence
                </>
              )}
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
