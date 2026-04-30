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
  Database,
  Menu,
  Settings2,
  MoreVertical
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

  const [currentPage, setCurrentPage] = useState(0);
  const [layoutMode, setLayoutMode] = useState<LayoutMode>('side-by-side');
  const [visibleLangs, setVisibleLangs] = useState<Language[]>(['ottoman', 'sorani', 'turkish']);
  const [showCMS, setShowCMS] = useState(false);
  const [showSavedToast, setShowSavedToast] = useState(false);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  
  // Interaction State
  const [activeHighlight, setActiveHighlight] = useState<{ sentenceId: string; lang: Language; index: number } | null>(null);
  const [popupPos, setPopupPos] = useState({ top: 0, left: 0 });

  const entriesPerPage = 10;
  const totalPages = Math.ceil(sentences.length / entriesPerPage);
  const paginatedSentences = sentences.slice(currentPage * entriesPerPage, (currentPage + 1) * entriesPerPage);

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
        setCurrentPage(prev => Math.max(0, prev - 1));
        clearInteraction();
      } else if (e.key === 'ArrowRight') {
        setCurrentPage(prev => Math.min(totalPages - 1, prev + 1));
        clearInteraction();
      } else if (e.key === 'Escape') {
        clearInteraction();
        setShowCMS(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [totalPages]);

  const clearInteraction = useCallback(() => {
    setActiveHighlight(null);
  }, []);

  const handleWordClick = (sentenceId: string, lang: Language, index: number, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent immediate closing if we move to click-away
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setPopupPos({
      top: rect.bottom + window.scrollY + 8,
      left: rect.left + rect.width / 2 - 110,
    });
    setActiveHighlight({ sentenceId, lang, index });
  };

  const getMapEntry = (sentence: Sentence, highlight: typeof activeHighlight) => {
    if (!highlight || highlight.sentenceId !== sentence.id) return null;
    return sentence.wordMap.find(m => m[highlight.lang] === highlight.index);
  };

  const toggleLang = (lang: Language) => {
    setVisibleLangs(prev => 
      prev.includes(lang) ? prev.filter(l => l !== lang) : [...prev, lang]
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <motion.div 
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
          className="w-10 h-10 border-2 border-slate-100 border-t-slate-900 rounded-full"
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans selection:bg-indigo-100 pb-20" onClick={() => setActiveHighlight(null)}>
      {/* Top Header */}
      <header className="sticky top-0 z-50 w-full bg-white/80 backdrop-blur-md border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button 
              onClick={(e) => { e.stopPropagation(); setShowMobileMenu(true); }}
              className="p-2 -ml-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
              aria-label="Navigation Menu"
            >
              <Menu className="w-6 h-6" />
            </button>
            <div className="hidden sm:block w-px h-6 bg-slate-200 mx-1" />
            <div className="cursor-pointer" onClick={() => setCurrentPage(0)}>
              <h1 className="text-lg font-black tracking-tight text-slate-900 leading-none">Ya Hakeem</h1>
              <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest mt-0.5">Risale-i Nur</p>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-6">
            {/* Desktop Toolbar */}
            <div className="hidden lg:flex items-center gap-2 pr-6 border-r border-slate-200">
               <div className="flex items-center bg-slate-100 rounded-lg p-0.5 border border-slate-200">
                  <button 
                    onClick={() => setLayoutMode('side-by-side')}
                    className={`p-1.5 rounded-md transition-all ${layoutMode === 'side-by-side' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-400 hover:text-slate-600'}`}
                    title="Parallel Mode"
                  >
                    <LayoutGrid className="w-4 h-4" />
                  </button>
                  <button 
                    onClick={() => setLayoutMode('stacked')}
                    className={`p-1.5 rounded-md transition-all ${layoutMode === 'stacked' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-400 hover:text-slate-600'}`}
                    title="Vertical Mode"
                  >
                    <LayoutList className="w-4 h-4" />
                  </button>
               </div>

               <div className="flex items-center gap-1.5">
                 {(['ottoman', 'sorani', 'turkish'] as Language[]).map(l => (
                   <button
                    key={l}
                    onClick={() => toggleLang(l)}
                    className={`px-2.5 py-1 text-[10px] font-black uppercase rounded-md border transition-all ${
                      visibleLangs.includes(l) 
                        ? `${l === 'ottoman' ? 'bg-indigo-50 border-indigo-200 text-indigo-700' : l === 'sorani' ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-rose-50 border-rose-200 text-rose-700'}` 
                        : 'bg-white border-slate-200 text-slate-300'
                    }`}
                   >
                    {l}
                   </button>
                 ))}
               </div>
            </div>

            {/* Mobile/Compact Actions */}
            <div className="flex lg:hidden items-center gap-1">
              <button 
                onClick={(e) => { e.stopPropagation(); setShowMobileMenu(true); }}
                className="p-2 text-slate-500 hover:bg-slate-100 rounded-lg"
              >
                <Settings2 className="w-5 h-5" />
              </button>
            </div>

            {/* Auth */}
            <div className="flex items-center gap-3">
              {user ? (
                <div className="flex items-center gap-3 bg-slate-50 pl-2 sm:pl-3 pr-1 py-1 rounded-full border border-slate-200">
                  <span className="hidden md:block text-[10px] font-black text-slate-500 uppercase tracking-tighter truncate max-w-[80px]">{user.displayName?.split(' ')[0]}</span>
                  <img src={user.photoURL || ''} alt="" className="w-7 h-7 sm:w-8 sm:h-8 rounded-full border border-white shadow-sm" />
                  <button onClick={() => signOut(auth)} className="p-1.5 sm:p-2 hover:bg-slate-200 rounded-full text-slate-400"><LogOut className="w-3.5 h-3.5" /></button>
                </div>
              ) : (
                <button 
                  onClick={signInWithGoogle}
                  className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-full text-xs font-bold hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-100"
                >
                  <LogIn className="w-3.5 h-3.5" />
                  <span className="hidden xs:inline">Sign In</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Mobile Navigation Drawer */}
      <AnimatePresence>
        {showMobileMenu && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowMobileMenu(false)}
              className="fixed inset-0 z-[60] bg-slate-900/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed top-0 left-0 bottom-0 z-[70] w-[280px] bg-white shadow-2xl flex flex-col"
              onClick={e => e.stopPropagation()}
            >
              <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                <div>
                  <h3 className="font-black text-slate-900 tracking-tight">Ya Hakeem</h3>
                  <p className="text-[10px] font-bold text-emerald-600 uppercase">Configuration</p>
                </div>
                <button onClick={() => setShowMobileMenu(false)} className="p-2 bg-slate-50 rounded-full text-slate-400 hover:text-slate-900 transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="flex-1 p-6 space-y-8">
                <section>
                  <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest block mb-4">View Mode</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button 
                      onClick={() => setLayoutMode('side-by-side')}
                      className={`flex flex-col items-center gap-2 p-4 rounded-xl border transition-all ${layoutMode === 'side-by-side' ? 'border-indigo-600 bg-indigo-50 text-indigo-700' : 'border-slate-200 text-slate-400'}`}
                    >
                      <LayoutGrid className="w-6 h-6" />
                      <span className="text-[10px] font-bold uppercase">Parallel</span>
                    </button>
                    <button 
                      onClick={() => setLayoutMode('stacked')}
                      className={`flex flex-col items-center gap-2 p-4 rounded-xl border transition-all ${layoutMode === 'stacked' ? 'border-indigo-600 bg-indigo-50 text-indigo-700' : 'border-slate-200 text-slate-400'}`}
                    >
                      <LayoutList className="w-6 h-6" />
                      <span className="text-[10px] font-bold uppercase">Vertical</span>
                    </button>
                  </div>
                </section>

                <section>
                  <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest block mb-4">Active Corpuses</label>
                  <div className="space-y-2">
                    {(['ottoman', 'sorani', 'turkish'] as Language[]).map(l => (
                      <button
                        key={l}
                        onClick={() => toggleLang(l)}
                        className={`w-full flex items-center justify-between p-4 rounded-xl border transition-all ${
                          visibleLangs.includes(l) 
                            ? 'border-emerald-600 bg-emerald-50 text-emerald-700' 
                            : 'border-slate-200 text-slate-400'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div className={`w-2 h-2 rounded-full ${LANG_META[l].color}`} />
                          <span className="text-xs font-bold uppercase">{LANG_META[l].label}</span>
                        </div>
                        {visibleLangs.includes(l) && <CheckCircle2 className="w-4 h-4" />}
                      </button>
                    ))}
                  </div>
                </section>
              </div>

              <div className="p-6 bg-slate-50 border-t border-slate-100 italic text-[10px] text-slate-400 text-center">
                Refining the Risale-i Nur lexicon through comparison.
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Main List */}
      <main className="max-w-7xl mx-auto px-4 py-8">
        {sentences.length > 0 ? (
          <div className="space-y-6">
            <AnimatePresence mode="popLayout">
              {paginatedSentences.map((sentence, sIdx) => {
                const visibleCount = Object.keys(LANG_META).filter(l => visibleLangs.includes(l as Language)).length;
                return (
                  <motion.div
                    key={sentence.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.98 }}
                    transition={{ delay: (sIdx % entriesPerPage) * 0.05 }}
                    className="group relative bg-white rounded-3xl border border-slate-200 overflow-hidden hover:shadow-2xl hover:border-emerald-100 transition-all duration-300"
                  >
                    <div className={`p-6 sm:p-8 grid gap-10 ${
                      layoutMode === 'side-by-side' 
                        ? visibleCount === 1 ? 'grid-cols-1' : visibleCount === 2 ? 'md:grid-cols-2' : 'lg:grid-cols-3' 
                        : 'grid-cols-1'
                    }`}>
                      {Object.entries(LANG_META).map(([langKey, meta]) => {
                        const lang = langKey as Language;
                        if (!visibleLangs.includes(lang)) return null;

                        const words = sentence[lang];
                        const isRTL = meta.rtl;
                        const highlight = activeHighlight && activeHighlight.sentenceId === sentence.id ? activeHighlight : null;
                        const mapEntry = getMapEntry(sentence, highlight);

                        return (
                          <div key={lang} className={`flex flex-col ${isRTL ? 'text-right' : 'text-left'}`} dir={isRTL ? 'rtl' : 'ltr'}>
                            <div className={`flex items-center gap-2 mb-4 pb-2 border-b border-slate-50 ${isRTL ? 'flex-row-reverse' : 'flex-row'}`}>
                              <div className={`w-3 h-3 rounded-full ${meta.color} ring-4 ring-slate-50`} />
                              <span className="text-[10px] font-black uppercase text-slate-400 tracking-widest">{meta.label}</span>
                            </div>
                            
                            <div className="flex flex-wrap gap-x-1.5 gap-y-3">
                              {words.map((word, wordIdx) => {
                                const isClicked = highlight?.lang === lang && highlight?.index === wordIdx;
                                const isLinked = mapEntry && mapEntry[lang] === wordIdx && !isClicked;

                                return (
                                  <button
                                    key={wordIdx}
                                    onClick={(e) => handleWordClick(sentence.id, lang, wordIdx, e)}
                                    className={`
                                      relative px-2 py-1 rounded-lg transition-all cursor-pointer select-none outline-none focus-visible:ring-2 focus-visible:ring-indigo-400
                                      ${isRTL ? 'font-serif text-2xl sm:text-3xl leading-relaxed' : 'font-serif text-xl sm:text-2xl'}
                                      ${isClicked ? 'bg-indigo-600 text-white shadow-lg ring-2 ring-indigo-600 z-10 scale-105' : ''}
                                      ${isLinked ? 'bg-emerald-50 ring-1 ring-emerald-200 text-emerald-900 font-bold' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'}
                                    `}
                                  >
                                    {word || '—'}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Row Actions */}
                    {user?.uid === sentence.authorId && (
                      <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-all">
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            if(confirm("Delete entry?")) deleteDoc(doc(db, 'sentences', sentence.id));
                          }}
                          className="p-2.5 bg-white shadow-md hover:bg-rose-50 text-slate-300 hover:text-rose-500 rounded-full border border-slate-100 transition-all transform hover:scale-110"
                        >
                          <Trash2 className="w-5 h-5" />
                        </button>
                      </div>
                    )}
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-32 text-center">
             <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center mb-6">
                <Database className="w-10 h-10 text-slate-300" />
             </div>
             <h3 className="text-2xl font-black text-slate-900">The library is empty</h3>
             <p className="text-sm text-slate-500 mt-2 max-w-sm">Sign in to begin documenting the Risale-i Nur lexicon through parallel trilingual analysis.</p>
          </div>
        )}
      </main>

      {/* Pagination Footer */}
      {totalPages > 1 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-indigo-900 text-white px-5 py-3 rounded-2xl shadow-2xl z-40">
           <button 
             disabled={currentPage === 0}
             onClick={() => {setCurrentPage(p => p - 1); window.scrollTo(0,0);}}
             className="p-2 rounded-xl hover:bg-white/10 disabled:opacity-20 transition-colors"
           >
             <ChevronLeft className="w-5 h-5" />
           </button>
           <div className="flex items-center gap-2 px-4 border-l border-r border-white/10">
              {Array.from({length: totalPages}).map((_, i) => (
                <button 
                  key={i}
                  onClick={() => {setCurrentPage(i); window.scrollTo(0,0);}}
                  className={`w-2.5 h-2.5 rounded-full transition-all ${currentPage === i ? 'w-8 bg-emerald-400' : 'bg-white/20 hover:bg-white/40'}`}
                />
              ))}
           </div>
           <button 
             disabled={currentPage === totalPages - 1}
             onClick={() => {setCurrentPage(p => p + 1); window.scrollTo(0,0);}}
             className="p-2 rounded-xl hover:bg-white/10 disabled:opacity-20 transition-colors"
           >
             <ChevronRight className="w-5 h-5" />
           </button>
        </div>
      )}

      {/* Floating Action Button */}
      {user && (
        <motion.button
          whileHover={{ scale: 1.1, rotate: 90 }}
          whileTap={{ scale: 0.9 }}
          onClick={(e) => { e.stopPropagation(); setShowCMS(true); }}
          className="fixed bottom-8 right-8 w-16 h-16 bg-rose-600 text-white rounded-2xl shadow-2xl shadow-rose-200 flex items-center justify-center hover:bg-rose-700 transition-all z-40"
        >
          <Plus className="w-8 h-8" />
        </motion.button>
      )}

      {/* Word Popup */}
      <AnimatePresence>
        {activeHighlight && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 10 }}
            onClick={e => e.stopPropagation()}
            className="fixed z-[100] w-72 bg-slate-900 text-white rounded-3xl shadow-2xl p-6 pointer-events-auto border border-white/5"
            style={{ top: popupPos.top, left: popupPos.left }}
          >
            <div className="flex items-center justify-between mb-5 pb-3 border-b border-white/10">
              <div className="flex items-center gap-2">
                <Info className="w-4 h-4 text-emerald-400" />
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Lexical Link</span>
              </div>
              <button 
                onClick={() => setActiveHighlight(null)}
                className="p-1 hover:bg-white/10 rounded-full transition-colors"
              >
                <X className="w-4 h-4 text-slate-500" />
              </button>
            </div>
            <div className="space-y-6">
               {Object.entries(LANG_META).map(([langKey, meta]) => {
                  const l = langKey as Language;
                  if (l === activeHighlight.lang) return null;
                  
                  const activeSent = sentences.find(s => s.id === activeHighlight.sentenceId);
                  const entry = activeSent ? getMapEntry(activeSent, activeHighlight) : null;
                  const idx = entry ? entry[l] : null;
                  const word = (activeSent && idx !== null) ? activeSent[l][idx] : '—';

                  return (
                    <div key={l} className="flex flex-col gap-1.5 Group">
                      <div className="flex items-center gap-2">
                        <div className={`w-1.5 h-1.5 rounded-full ${meta.color}`} />
                        <span className="text-[9px] font-black text-slate-500 uppercase tracking-tighter">{meta.label}</span>
                      </div>
                      <span className={`text-base leading-relaxed ${meta.rtl ? 'font-serif text-xl text-right text-emerald-50 font-medium' : 'font-serif font-bold text-slate-100'}`}>{word}</span>
                    </div>
                  );
               })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showCMS && user && (
          <CMSModal 
            user={user}
            onClose={() => setShowCMS(false)} 
            onSave={async (data) => {
              try {
                await addDoc(collection(db, 'sentences'), { ...data, authorId: user.uid, createdAt: serverTimestamp() });
                setShowCMS(false);
                setShowSavedToast(true);
                setTimeout(() => setShowSavedToast(false), 2000);
              } catch (e) { handleFirestoreError(e, OperationType.CREATE, 'sentences'); }
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
