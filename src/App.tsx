/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  ChevronLeft, 
  ChevronRight, 
  ChevronDown,
  Plus,
  Minus,
  RotateCcw, 
  X, 
  Languages, 
  LayoutGrid, 
  LayoutList,
  Layout,
  CheckCircle2,
  Info,
  LogIn,
  LogOut,
  User as UserIcon,
  Trash2,
  Database,
  Menu,
  Settings2,
  Type as TypeIcon,
  MoreVertical,
  Edit3,
  Link2,
  Sun,
  Moon,
  Share2,
  Copy,
  AlertTriangle,
  MessageSquare,
  Check,
  RefreshCw,
  Sparkles,
  ArrowUp
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
  updateDoc,
  Timestamp 
} from 'firebase/firestore';

import { GoogleGenAI, Type as aiType } from "@google/genai";

// --- AI Service ---
const aiApiKey = import.meta.env.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY;
const genAI = new GoogleGenAI({ apiKey: aiApiKey });
const ai = genAI;

const translateToSorani = async (ottoman: string) => {
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `Translate the following Ottoman Turkish sentence from Risale-i Nur into Sorani Kurdish. 
    The translation should be academic and faithful to the original style.
    Note: Risale-i Nur terminology is very specific. Translate with high accuracy.
    
    Ottoman: ${ottoman}
    
    Return ONLY the Sorani Kurdish translation.`,
  });
  return response.text.trim();
};

const autoMapIndices = async (ottoman: string[], sorani: string[], turkish: string[]) => {
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `Map the corresponding words between these three parallel versions of a sentence.
    Ottoman, Turkish, and Sorani. 
    Note: Ottoman and Turkish are highly compatible word-for-word.
    
    Ottoman Tokens: ${JSON.stringify(ottoman.map((t, i) => `${i}: ${t}`))}
    Turkish Tokens: ${JSON.stringify(turkish.map((t, i) => `${i}: ${t}`))}
    Sorani Tokens: ${JSON.stringify(sorani.map((t, i) => `${i}: ${t}`))}
    
    Return a list of mapping objects. Each object should have 'ottoman', 'sorani', and 'turkish' keys containing the word index for that language. If a word doesn't have a direct map in a language, use null.`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: aiType.ARRAY,
        items: {
          type: aiType.OBJECT,
          properties: {
            ottoman: { type: aiType.INTEGER, nullable: true },
            sorani: { type: aiType.INTEGER, nullable: true },
            turkish: { type: aiType.INTEGER, nullable: true }
          }
        }
      }
    }
  });
  
  try {
    return JSON.parse(response.text);
  } catch (e) {
    console.error("Failed to parse AI mapping:", e);
    return [];
  }
};

// --- Types ---

type Language = 'ottoman' | 'sorani' | 'turkish';
type LayoutMode = 'side-by-side' | 'stacked';

interface WordMap {
  ottoman: number | null;
  sorani: number | null;
  turkish: number | null;
}

interface Sentence {
  id: string;
  bookId: string;
  itemId: string;
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

const RISALE_SECTIONS = [
  { 
    id: 'sozler', 
    title: 'Sözler', 
    color: 'bg-emerald-500',
    items: [
      { id: 'soz-1', title: 'Birinci Söz', detail: '' },
      { id: 'soz-2', title: 'İkinci Söz', detail: '' },
      { id: 'soz-3', title: 'Üçüncü Söz', detail: '' },
      { id: 'soz-4', title: 'Dördüncü Söz', detail: '' },
      { id: 'soz-5', title: 'Beşinci Söz', detail: '' },
      { id: 'soz-6', title: 'Altıncı Söz', detail: '' },
      { id: 'soz-7', title: 'Yedinci Söz', detail: '' },
      { id: 'soz-8', title: 'Sekizinci Söz', detail: '' },
      { id: 'soz-9', title: 'Dokuzuncu Söz', detail: '' },
      { 
        id: 'soz-10', title: 'Onuncu Söz', detail: '',
        subItems: [
          { id: 'soz-10-muk', title: 'Mukaddime', detail: '' },
          { id: 'soz-10-sur', title: 'On İki Suret', detail: '' },
          { id: 'soz-10-hat', title: 'Hâtime: İşaretler (Beş İşaret)', detail: '' },
          { id: 'soz-10-zey', title: 'Zeyiller (Birinci - Beşinci Zeyil)', detail: '' },
        ]
      },
      { id: 'soz-11', title: 'On Birinci Söz', detail: '' },
      { id: 'soz-12', title: 'On İkinci Söz', detail: '' },
      { 
        id: 'soz-13', title: 'On Üçüncü Söz', detail: '',
        subItems: [
          { id: 'soz-13-mak2', title: 'İkinci Makam', detail: '' },
          { id: 'soz-13-huv', title: 'Hüve Nüktesi', detail: '' },
        ]
      },
      { 
        id: 'soz-14', title: 'On Dördüncü Söz', detail: '',
        subItems: [
          { id: 'soz-14-zey', title: 'Zeyil', detail: '' }
        ]
      },
      { 
        id: 'soz-15', title: 'On Beşinci Söz', detail: '',
        subItems: [
          { id: 'soz-15-bas', title: 'Yedi Basamak', detail: '' }
        ]
      },
      { 
        id: 'soz-16', title: 'On Altıncı Söz', detail: '',
        subItems: [
          { id: 'soz-16-sua', title: 'Dört Şua', detail: '' },
          { id: 'soz-16-zey', title: 'Zeyil', detail: '' }
        ]
      },
      { 
        id: 'soz-17', title: 'On Yedinci Söz', detail: '',
        subItems: [
          { id: 'soz-17-mak1', title: 'Birinci Makam', detail: '' },
          { id: 'soz-17-mak2', title: 'İkinci Makam', detail: '' }
        ]
      },
      { id: 'soz-18', title: 'On Sekizinci Söz', detail: '' },
      { 
        id: 'soz-19', title: 'On Dokuzuncu Söz', detail: '',
        subItems: [
          { id: 'soz-19-res', title: 'On Yedi Reşha', detail: '' }
        ]
      },
      { 
        id: 'soz-20', title: 'Yirminci Söz', detail: '',
        subItems: [
          { id: 'soz-20-mak1', title: 'Birinci Makam', detail: '' },
          { id: 'soz-20-mak2', title: 'İkinci Makam', detail: '' }
        ]
      },
      { 
        id: 'soz-21', title: 'Yirmi Birinci Söz', detail: '',
        subItems: [
          { id: 'soz-21-mak1', title: 'Birinci Makam (Beş İkaz)', detail: '' },
          { id: 'soz-21-mak2', title: 'İkinci Makam (Beş Vecih)', detail: '' }
        ]
      },
      { 
        id: 'soz-22', title: 'Yirmi İkinci Söz', detail: '',
        subItems: [
          { id: 'soz-22-mak1', title: 'Birinci Makam (On İki Burhan)', detail: '' },
          { id: 'soz-22-mak2', title: 'İkinci Makam (On İki Lem\'a)', detail: '' }
        ]
      },
      { 
        id: 'soz-23', title: 'Yirmi Üçüncü Söz', detail: '',
        subItems: [
          { id: 'soz-23-mak1', title: 'Birinci Makam (Beş Nokta)', detail: '' },
          { id: 'soz-23-mak2', title: 'İkinci Makam (Beş Nükte)', detail: '' }
        ]
      },
      { 
        id: 'soz-24', title: 'Yirmi Dördüncü Söz', detail: '',
        subItems: [
          { id: 'soz-24-dal', title: 'Beş Dal', detail: '' }
        ]
      },
      { 
        id: 'soz-25', title: 'Yirmi Beşinci Söz', detail: '',
        subItems: [
          { id: 'soz-25-sul', title: 'Üç Şule', detail: '' },
          { id: 'soz-25-zey', title: 'Zeyiller', detail: '' }
        ]
      },
      { 
        id: 'soz-26', title: 'Yirmi Altıncı Söz', detail: '',
        subItems: [
          { id: 'soz-26-meb', title: 'Dört Mebhas', detail: '' },
          { id: 'soz-26-zey', title: 'Zeyil', detail: '' }
        ]
      },
      { 
        id: 'soz-27', title: 'Yirmi Yedinci Söz', detail: '',
        subItems: [
          { id: 'soz-27-zey', title: 'Zeyil (Dört Hatve)', detail: '' }
        ]
      },
      { 
        id: 'soz-28', title: 'Yirmi Sekizinci Söz', detail: '',
        subItems: [
          { id: 'soz-28-zey', title: 'Zeyil', detail: '' }
        ]
      },
      { 
        id: 'soz-29', title: 'Yirmi Dokuzuncu Söz', detail: '',
        subItems: [
          { id: 'soz-29-mak1', title: 'Birinci Maksat', detail: '' },
          { id: 'soz-29-mak2', title: 'İkinci Maksat', detail: '' }
        ]
      },
      { 
        id: 'soz-30', title: 'Otuzuncu Söz', detail: '',
        subItems: [
          { id: 'soz-30-mak1', title: 'Birinci Maksat (Ene)', detail: '' },
          { id: 'soz-30-mak2', title: 'İkinci Maksat (Zerre)', detail: '' }
        ]
      },
      { 
        id: 'soz-31', title: 'Otuz Birinci Söz', detail: '',
        subItems: [
          { id: 'soz-31-esa', title: 'Dört Esas', detail: '' }
        ]
      },
      { 
        id: 'soz-32', title: 'Otuz İkinci Söz', detail: '',
        subItems: [
          { id: 'soz-32-mov1', title: 'Birinci Mevkıf', detail: '' },
          { id: 'soz-32-mov2', title: 'İkinci Mevkıf', detail: '' },
          { id: 'soz-32-mov3', title: 'Üçüncü Mevkıf', detail: '' }
        ]
      },
      { 
        id: 'soz-33', title: 'Otuz Üçüncü Söz', detail: '',
        subItems: [
          { id: 'soz-33-pen', title: 'Otuz Üç Pencere', detail: '' }
        ]
      },
      { id: 'soz-34', title: 'Lemaat', detail: '' }
    ]
  },
  { 
    id: 'mektubat', 
    title: 'Mektubat', 
    color: 'bg-indigo-500',
    items: [
      { id: 'first-letter', title: 'Birinci Mektup', detail: 'Dört Sual' },
      { id: 'nineteenth-letter', title: 'On Dokuzuncu Mektup', detail: 'Mucizat-ı Ahmediye' }
    ]
  },
  { 
    id: 'lemalar', 
    title: 'Lem\'alar', 
    color: 'bg-amber-500',
    items: [
      { id: 'first-flash', title: 'Birinci Lem\'a', detail: 'Hz. Yunus' },
      { id: 'twenty-fifth-flash', title: 'Yirmi Beşinci Lem\'a', detail: 'Hastalar' }
    ]
  },
  { 
    id: 'sualar', 
    title: 'Şualar', 
    color: 'bg-rose-500',
    items: [
      { id: 'first-ray', title: 'Birinci Şua', detail: 'Ayetler' },
      { id: 'seventh-ray', title: 'Yedinci Şua', detail: 'Ayetü-l Kübra' }
    ]
  },
];

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

// --- Sidebar Component ---

interface SidebarContentProps {
  expandedSection: string | null;
  setExpandedSection: (id: string | null) => void;
  expandedItem: string | null;
  setExpandedItem: (id: string | null) => void;
  activeBookItem: { bookId: string; itemId: string } | null;
  setActiveBookItem: (val: { bookId: string; itemId: string }) => void;
  setShowMobileMenu: (show: boolean) => void;
  isDarkMode: boolean;
}

const SidebarContent = React.memo(({ 
  expandedSection, 
  setExpandedSection, 
  expandedItem, 
  setExpandedItem, 
  activeBookItem, 
  setActiveBookItem, 
  setShowMobileMenu,
  isDarkMode
}: SidebarContentProps) => (
  <div className={`flex flex-col h-full uppercase transition-colors ${isDarkMode ? 'bg-slate-800 text-slate-100' : 'bg-white text-slate-900'}`}>
    <div className="flex-1 overflow-y-auto p-4 space-y-6">
      <section>
        <label className={`text-[10px] font-black uppercase tracking-widest block mb-4 px-2 ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>Risale-i Nur Collection</label>
        <div className="space-y-2">
          {RISALE_SECTIONS.map(s => {
            const isExpanded = expandedSection === s.id;
            return (
              <div key={s.id} className="space-y-1">
                <button 
                  onClick={() => setExpandedSection(isExpanded ? null : s.id)}
                  className={`w-full flex items-center justify-between p-3 rounded-2xl transition-all text-left ${isExpanded ? (isDarkMode ? 'bg-slate-800 border border-slate-700 shadow-lg' : 'bg-slate-50 border border-slate-100 shadow-sm') : (isDarkMode ? 'hover:bg-slate-800/50' : 'hover:bg-slate-50')}`}
                >
                  <div className="flex items-center gap-2">
                    <div className={`w-1 h-5 rounded-full ${s.color} transition-all ${isExpanded ? 'opacity-100' : 'opacity-20 translate-x-[-2px]'}`} />
                    <div>
                      <p className={`text-[11px] font-black uppercase tracking-tight ${isExpanded ? (isDarkMode ? 'text-white' : 'text-slate-900') : (isDarkMode ? 'text-slate-300' : 'text-slate-700')}`}>{s.title}</p>
                    </div>
                  </div>
                  <ChevronDown className={`w-4 h-4 text-slate-300 transition-transform duration-300 ${isExpanded ? (isDarkMode ? 'rotate-180 text-white' : 'rotate-180 text-slate-600') : ''}`} />
                </button>
                
                <AnimatePresence>
                  {isExpanded && (
                    <motion.div 
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className={`overflow-hidden rounded-2xl mx-1 ${isDarkMode ? 'bg-slate-800/40 border border-slate-700/50' : 'bg-slate-50/50'}`}
                    >
                      <div className="py-1 px-1">
                        {s.items.map(item => {
                          const isLeaf = !item.subItems;
                          const isItemExpanded = expandedItem === item.id;
                          const isActive = activeBookItem?.bookId === s.id && (activeBookItem?.itemId === item.id || (item as any).subItems?.some((si: any) => si.id === activeBookItem?.itemId));
                          
                          return (
                            <div key={item.id} className="space-y-0.5">
                              <button 
                                onClick={() => {
                                  if (isLeaf) {
                                    setActiveBookItem({ bookId: s.id, itemId: item.id });
                                    setShowMobileMenu(false);
                                  } else {
                                    setExpandedItem(isItemExpanded ? null : item.id);
                                  }
                                }}
                                className={`w-full flex items-center justify-between p-2 px-4 rounded-xl text-left transition-all ${isActive ? (isDarkMode ? 'bg-indigo-600 text-white shadow-sm' : 'bg-white shadow-sm') : (isDarkMode ? 'hover:bg-slate-700/50 text-slate-300' : 'hover:bg-white/50 text-slate-500')}`}
                              >
                                <div className="flex items-center gap-2">
                                  <div className={`w-1 h-1 rounded-full ${isActive ? 'bg-white' : (isDarkMode ? 'bg-slate-600' : 'bg-slate-200')}`} />
                                  <div>
                                    <p className={`text-[10px] font-bold uppercase tracking-tight ${isActive ? 'text-white' : (isDarkMode ? 'text-slate-300' : 'text-slate-500')}`}>{item.title}</p>
                                    {item.detail && isLeaf && <p className={`text-[8px] font-medium truncate max-w-[140px] ${isActive ? 'text-indigo-200' : 'text-slate-500 dark:text-slate-500'}`}>{item.detail}</p>}
                                  </div>
                                </div>
                                {!isLeaf && (
                                  <ChevronDown className={`w-3 h-3 text-slate-300 transition-transform duration-300 ${isItemExpanded ? 'rotate-180' : ''}`} />
                                )}
                              </button>

                              <AnimatePresence>
                                {isItemExpanded && (item as any).subItems && (
                                  <motion.div
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: 'auto', opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                    className={`overflow-hidden rounded-lg mx-2 ${isDarkMode ? 'bg-slate-800/50' : 'bg-slate-100/50'}`}
                                  >
                                    <div className="py-1">
                                      {(item as any).subItems.map((si: any) => {
                                        const isSiActive = activeBookItem?.itemId === si.id;
                                        return (
                                          <button
                                            key={si.id}
                                            onClick={() => {
                                              setActiveBookItem({ bookId: s.id, itemId: si.id });
                                              setShowMobileMenu(false);
                                            }}
                                            className={`w-full py-1.5 px-6 text-left transition-all text-[9px] font-bold uppercase tracking-tight ${isSiActive ? (isDarkMode ? 'text-emerald-400 bg-slate-700' : 'text-emerald-600 bg-white/80') : (isDarkMode ? 'text-slate-400 hover:text-slate-200' : 'text-slate-400 hover:text-slate-600 hover:bg-white/40')}`}
                                          >
                                            {si.title}
                                          </button>
                                        );
                                      })}
                                    </div>
                                  </motion.div>
                                )}
                              </AnimatePresence>
                            </div>
                          );
                        })}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      </section>
    </div>
    <div className={`p-6 border-t font-serif italic text-[9px] text-center leading-relaxed ${isDarkMode ? 'bg-slate-900/40 border-slate-800/50 text-slate-400' : 'bg-slate-50 border-slate-100 text-slate-400'}`}>
      "Refining the Risale-i Nur lexicon through comparison."
    </div>
  </div>
));

// --- Display Settings Component ---

const DisplaySettingsSheet = ({ 
  show, 
  onClose, 
  turkishFont, 
  setTurkishFont, 
  turkishFontSize,
  setTurkishFontSize,
  kurdishFont, 
  setKurdishFont, 
  kurdishFontSize,
  setKurdishFontSize,
  ottomanFont, 
  setOttomanFont,
  ottomanFontSize,
  setOttomanFontSize,
  layoutMode,
  setLayoutMode,
  visibleLangs,
  toggleLang,
  onReset,
  isDarkMode,
  setIsDarkMode,
  DEFAULT_SIZES
}: any) => {
  const [expandedLangs, setExpandedLangs] = useState<string[]>([]);
  if (!show) return null;

  const toggleExpanded = (id: string) => {
    setExpandedLangs(prev => 
      prev.includes(id) ? prev.filter(l => l !== id) : [...prev, id]
    );
  };
  
  const turkishOptions = [
    { id: 'font-literata', label: 'Literata' },
    { id: 'font-barla-souvenir', label: 'Souvenir' },
    { id: 'font-barla-aria', label: 'Aria' },
    { id: 'font-barla-liva', label: 'Liva' },
    { id: 'font-old-standard', label: 'Classic' },
    { id: 'font-sans', label: 'Sans' },
    { id: 'font-serif', label: 'Lora' }
  ];

  const arabicOptions = [
    { id: 'font-serif', label: 'Traditional' },
    { id: 'font-sans', label: 'Modern' },
    { id: 'font-mono', label: 'Mono' }
  ];

  const FontSelector = ({ value, setter, options }: any) => (
    <div className="flex flex-wrap gap-1.5 pt-2">
      {options.map((opt: any) => (
        <button
          key={opt.id}
          onClick={() => setter(opt.id)}
          className={`px-2.5 py-1.5 rounded-lg text-[9px] font-black uppercase transition-all border ${
            value === opt.id 
              ? 'bg-slate-900 dark:bg-indigo-600/50 border-slate-900 dark:border-indigo-500/50 text-white shadow-sm' 
              : 'bg-white dark:bg-slate-800/50 border-slate-100 dark:border-slate-700 text-slate-400 dark:text-slate-500 hover:border-slate-300 dark:hover:border-slate-600 hover:text-slate-600 dark:hover:text-slate-300'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );

  const SizeStepper = ({ value, setter, defaultSize }: any) => (
    <div className="flex items-center gap-2">
      <div className={`flex items-center p-1 rounded-xl border ${isDarkMode ? 'bg-slate-900 border-slate-800' : 'bg-slate-100 border-slate-200/50'}`}>
        <button 
          onClick={() => setter(Math.max(12, value - 1))}
          className={`w-7 h-7 flex items-center justify-center rounded-lg shadow-sm transition-all active:scale-95 ${isDarkMode ? 'bg-slate-800 text-slate-300 hover:text-white border border-slate-700' : 'bg-white text-slate-500 hover:text-slate-900'}`}
        >
          <Minus className="w-3 h-3" />
        </button>
        <div className="min-w-[2.2rem] text-center">
          <span className={`text-[10px] font-black ${isDarkMode ? 'text-slate-100' : 'text-slate-700'}`}>{value}</span>
        </div>
        <button 
          onClick={() => setter(Math.min(48, value + 1))}
          className={`w-7 h-7 flex items-center justify-center rounded-lg shadow-sm transition-all active:scale-95 ${isDarkMode ? 'bg-slate-800 text-slate-300 hover:text-white border border-slate-700' : 'bg-white text-slate-500 hover:text-slate-900'}`}
        >
          <Plus className="w-3 h-3" />
        </button>
      </div>
      {DEFAULT_SIZES && value !== defaultSize && (
        <button 
          onClick={() => setter(defaultSize)}
          title="Reset Size"
          className="p-2 text-slate-300 hover:text-indigo-600 transition-colors"
        >
          <RotateCcw className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );

  return (
    <AnimatePresence>
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className={`fixed inset-0 z-[100] backdrop-blur-[2px] flex justify-end focus:outline-none overflow-hidden ${isDarkMode ? 'bg-slate-900/60' : 'bg-slate-900/40'}`}
      >
      <motion.div 
        initial={{ opacity: 0, x: 100 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: 100 }}
        transition={{ type: "spring", damping: 30, stiffness: 300 }}
        onClick={e => e.stopPropagation()}
        className={`w-full max-w-sm sm:max-w-xs h-full shadow-2xl overflow-hidden border-l flex flex-col ${isDarkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-100'}`}
      >
        <div className={`p-6 border-b flex items-center justify-between backdrop-blur-md ${isDarkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-50'}`}>
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-50 dark:bg-indigo-900/30 rounded-xl">
              <Settings2 className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            </div>
            <div>
              <h3 className="font-black text-slate-900 dark:text-white uppercase tracking-[0.2em] text-[10px]">Display preferences</h3>
              <p className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Interface Calibration</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button 
              onClick={onReset}
              title="Reset to defaults"
              className="p-2 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-full text-slate-300 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
            <button onClick={onClose} className="p-2 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-full transition-colors text-slate-300 dark:text-slate-500 hover:text-slate-500 dark:hover:text-slate-400">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
        
        <div className="flex-1 p-6 space-y-10 overflow-y-auto">
          <section className="space-y-4">
            <label className="text-[9px] font-black uppercase text-slate-400 dark:text-slate-500 tracking-[0.15em] ml-1">UI Theme</label>
          <div className={`flex bg-slate-50 dark:bg-slate-800 p-1 rounded-2xl border border-slate-100/50 dark:border-slate-700`}>
              <button 
                onClick={() => setIsDarkMode(false)}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-[9px] font-black uppercase transition-all ${!isDarkMode ? 'bg-white shadow-sm text-slate-900 border border-slate-100' : 'text-slate-400 hover:text-slate-600'}`}
              >
                <Sun className="w-3.5 h-3.5" /> Light
              </button>
              <button 
                onClick={() => setIsDarkMode(true)}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-[9px] font-black uppercase transition-all ${isDarkMode ? 'bg-slate-800 shadow-inner text-white border border-slate-700' : 'text-slate-400 hover:text-slate-500 font-bold dark:hover:text-slate-200'}`}
              >
                <Moon className="w-3.5 h-3.5" /> Dark
              </button>
            </div>
          </section>

          <section className="space-y-4">
            <label className="text-[9px] font-black uppercase text-slate-400 dark:text-slate-500 tracking-[0.15em] ml-1">Languages & Layout</label>
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                {(['ottoman', 'sorani', 'turkish'] as Language[]).map(l => (
                  <button
                    key={l}
                    onClick={() => toggleLang(l)}
                    className={`flex items-center gap-2 px-3 py-2 text-[9px] font-black uppercase rounded-xl transition-all border ${
                      visibleLangs.includes(l) 
                        ? `${l === 'ottoman' ? 'bg-indigo-50 dark:bg-indigo-900/30 border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-400 font-black' : l === 'sorani' ? 'bg-emerald-50 dark:bg-emerald-900/30 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400 font-black' : 'bg-rose-50 dark:bg-rose-900/30 border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-400 font-black'}` 
                        : `${isDarkMode ? 'bg-slate-900 border-slate-800 text-slate-500 hover:text-slate-300 hover:border-slate-700' : 'bg-white border-slate-100 text-slate-300 hover:text-slate-600'}`
                    }`}
                  >
                    <div className={`w-1.5 h-1.5 rounded-full ${visibleLangs.includes(l) ? 'bg-current' : 'bg-slate-200 dark:bg-slate-700'}`} />
                    {l.slice(0,3)}
                  </button>
                ))}
              </div>

              <div className="flex flex-col gap-1.5">
                <button 
                  onClick={() => setLayoutMode('side-by-side')}
                  className={`flex items-center gap-2 px-3 py-2 rounded-xl text-[9px] font-black uppercase transition-all border ${layoutMode === 'side-by-side' ? 'bg-indigo-500/10 border-indigo-500/30 text-indigo-600 dark:text-indigo-400' : 'bg-slate-50/50 dark:bg-slate-800/40 text-slate-300 dark:text-slate-500 border-transparent'}`}
                >
                  <LayoutGrid className="w-3.5 h-3.5" /> Grid
                </button>
                <button 
                  onClick={() => setLayoutMode('stacked')}
                  className={`flex items-center gap-2 px-3 py-2 rounded-xl text-[9px] font-black uppercase transition-all border ${layoutMode === 'stacked' ? 'bg-indigo-500/10 border-indigo-500/30 text-indigo-600 dark:text-indigo-400' : 'bg-slate-50/50 dark:bg-slate-800/40 text-slate-300 dark:text-slate-500 border-transparent'}`}
                >
                  <LayoutList className="w-3.5 h-3.5" /> List
                </button>
              </div>
            </div>
          </section>

          <section className="space-y-4">
            <label className="text-[9px] font-black uppercase text-slate-400 dark:text-slate-500 tracking-[0.15em] block ml-1">Text Settings</label>
            
            <div className="space-y-3">
              {[
                { id: 'turkish', label: 'Turkish', value: turkishFont, setter: setTurkishFont, size: turkishFontSize, sizeSetter: setTurkishFontSize, options: turkishOptions, defaultSize: DEFAULT_SIZES?.turkish },
                { id: 'kurdish', label: 'Kurdish', value: kurdishFont, setter: setKurdishFont, size: kurdishFontSize, sizeSetter: setKurdishFontSize, options: arabicOptions, defaultSize: DEFAULT_SIZES?.kurdish },
                { id: 'ottoman', label: 'Ottoman', value: ottomanFont, setter: setOttomanFont, size: ottomanFontSize, sizeSetter: setOttomanFontSize, options: arabicOptions, defaultSize: DEFAULT_SIZES?.ottoman },
              ].map(group => {
                const isExpanded = expandedLangs.includes(group.id);
                return (
                  <div key={group.id} className={`overflow-hidden rounded-[2rem] border transition-all ${isExpanded ? 'border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/20' : 'border-slate-100 dark:border-slate-800 bg-transparent'}`}>
                    <button 
                      onClick={() => toggleExpanded(group.id)}
                      className="w-full flex items-center justify-between p-4 px-5 text-left"
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-xl flex items-center justify-center font-black text-[10px] ${isExpanded ? 'bg-indigo-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500'}`}>
                          {group.label[0]}
                        </div>
                        <span className="text-[10px] font-black text-slate-800 dark:text-slate-200 uppercase tracking-widest">{group.label}</span>
                      </div>
                      <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                    </button>
                    
                    <motion.div
                      initial={false}
                      animate={{ height: isExpanded ? 'auto' : 0, opacity: isExpanded ? 1 : 0 }}
                      className="overflow-hidden"
                    >
                      <div className="p-5 pt-0 space-y-4">
                        <div className="flex items-center justify-between">
                          <span className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Font Size</span>
                          <SizeStepper value={group.size} setter={group.sizeSetter} defaultSize={group.defaultSize} />
                        </div>
                        <FontSelector value={group.value} setter={group.setter} options={group.options} />
                      </div>
                    </motion.div>
                  </div>
                );
              })}
            </div>
          </section>
        </div>
        
        <div className={`p-6 border-t mt-auto ${isDarkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-50'}`}>
          <button 
            onClick={onClose}
            className="w-full py-4 bg-slate-900 dark:bg-indigo-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] shadow-lg hover:opacity-90 transition-all active:scale-[0.98]"
          >
            Apply & Close
          </button>
        </div>
      </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};


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
  const [showSettingsSheet, setShowSettingsSheet] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [expandedSection, setExpandedSection] = useState<string | null>(null);
  const [expandedItem, setExpandedItem] = useState<string | null>(null);
  const [activeBookItem, setActiveBookItem] = useState<{ bookId: string; itemId: string } | null>({ bookId: 'sozler', itemId: 'soz-1' });
  const [editingEntry, setEditingEntry] = useState<Sentence | null>(null);
  const [showScrollTop, setShowScrollTop] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setShowScrollTop(window.scrollY > 400);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const [activeMenu, setActiveMenu] = useState<string | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [feedbackSentence, setFeedbackSentence] = useState<Sentence | null>(null);
  const [isDarkMode, setIsDarkMode] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('theme');
      return saved === 'dark' || (!saved && window.matchMedia('(prefers-color-scheme: dark)').matches);
    }
    return false;
  });

  useEffect(() => {
    const root = window.document.documentElement;
    if (isDarkMode) {
      root.classList.add('dark');
      root.style.colorScheme = 'dark';
      localStorage.setItem('theme', 'dark');
      document.body.style.backgroundColor = '#0f172a'; // slate-900
    } else {
      root.classList.remove('dark');
      root.style.colorScheme = 'light';
      localStorage.setItem('theme', 'light');
      document.body.style.backgroundColor = '#ffffff';
    }
  }, [isDarkMode]);

  // Defaults
  const DEFAULT_FONTS = {
    turkish: 'font-literata',
    kurdish: 'font-serif',
    ottoman: 'font-serif'
  };
  const DEFAULT_SIZES = {
    turkish: 20,
    kurdish: 24,
    ottoman: 24
  };

  const [turkishFont, setTurkishFont] = useState(DEFAULT_FONTS.turkish);
  const [kurdishFont, setKurdishFont] = useState(DEFAULT_FONTS.kurdish);
  const [ottomanFont, setOttomanFont] = useState(DEFAULT_FONTS.ottoman);
  const [turkishFontSize, setTurkishFontSize] = useState(DEFAULT_SIZES.turkish);
  const [kurdishFontSize, setKurdishFontSize] = useState(DEFAULT_SIZES.kurdish);
  const [ottomanFontSize, setOttomanFontSize] = useState(DEFAULT_SIZES.ottoman);
  
  const resetSettings = () => {
    setTurkishFont(DEFAULT_FONTS.turkish);
    setKurdishFont(DEFAULT_FONTS.kurdish);
    setOttomanFont(DEFAULT_FONTS.ottoman);
    setTurkishFontSize(DEFAULT_SIZES.turkish);
    setKurdishFontSize(DEFAULT_SIZES.kurdish);
    setOttomanFontSize(DEFAULT_SIZES.ottoman);
  };
  
  // Interaction State
  const [activeHighlight, setActiveHighlight] = useState<{ sentenceId: string; lang: Language; index: number } | null>(null);
  const [popupPos, setPopupPos] = useState({ top: 0, left: 0 });

  const entriesPerPage = 10;
  const filteredSentences = sentences.filter(s => 
    activeBookItem ? (s.bookId === activeBookItem.bookId && s.itemId === activeBookItem.itemId) : true
  );
  const totalPages = Math.ceil(filteredSentences.length / entriesPerPage);
  const paginatedSentences = filteredSentences.slice(currentPage * entriesPerPage, (currentPage + 1) * entriesPerPage);

  const activeBook = useMemo(() => RISALE_SECTIONS.find(s => s.id === activeBookItem?.bookId), [activeBookItem?.bookId]);
  
  const fontSettingsArr = useMemo(() => [
    { id: 'turkish', label: 'Turkish', state: turkishFont, setter: setTurkishFont },
    { id: 'sorani', label: 'Kurdish', state: kurdishFont, setter: setKurdishFont },
    { id: 'ottoman', label: 'Ottoman', state: ottomanFont, setter: setOttomanFont },
  ], [turkishFont, kurdishFont, ottomanFont]);

  const activeItem = useMemo(() => {
    if (!activeBook) return null;
    return activeBook.items.find(i => i.id === activeBookItem?.itemId) || 
           activeBook.items.flatMap(i => (i as any).subItems || []).find((si: any) => si.id === activeBookItem?.itemId);
  }, [activeBook, activeBookItem?.itemId]);

  const activeParentItem = useMemo(() => {
    if (!activeBook || !activeBookItem?.itemId) return null;
    // If the active item is a subItem, find its parent
    for (const item of activeBook.items) {
      if ((item as any).subItems?.some((si: any) => si.id === activeBookItem.itemId)) {
        return item;
      }
    }
    return null;
  }, [activeBook, activeBookItem?.itemId]);

  // Auth Listener
  useEffect(() => {
    return onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
  }, []);

  // Firestore Listener
  useEffect(() => {
    if (loading) return;
    
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
  }, [loading]);

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
    e.stopPropagation();
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

  const getMetadataString = (sentence: Sentence) => {
    const book = RISALE_SECTIONS.find(s => s.id === sentence.bookId);
    if (!book) return '';
    
    const item = book.items.find(i => i.id === sentence.itemId) || 
                 book.items.flatMap(i => (i as any).subItems || []).find((si: any) => si.id === sentence.itemId);
    
    if (!item) return book.title;

    let parentTitle = '';
    // Find parent if it's a subitem
    for (const p of book.items) {
      if ((p as any).subItems?.some((si: any) => si.id === sentence.itemId)) {
        parentTitle = p.title;
        break;
      }
    }

    return `${book.title} - ${parentTitle ? parentTitle + ' - ' : ''}${item.title}`;
  };

  const formatSentenceForShare = (sentence: Sentence) => {
    const text = Object.keys(LANG_META)
      .filter(l => visibleLangs.includes(l as Language))
      .map(l => sentence[l as Language].join(' '))
      .join('\n\n');
    
    const metadata = getMetadataString(sentence);
    return `${text}\n\n${metadata}`;
  };

  const handleShare = (sentence: Sentence) => {
    const sharedText = formatSentenceForShare(sentence);
    const subject = "Read Risale i Nur on Ya Hakeem";
    
    if (navigator.share) {
      navigator.share({
        title: subject,
        text: sharedText,
        url: window.location.href
      }).catch(console.error);
    } else {
      // Fallback for email or others if needed
      const mailtoUrl = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(sharedText + '\n\n' + window.location.href)}`;
      window.open(mailtoUrl);
    }
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
    <div className={`min-h-screen ${isDarkMode ? 'dark bg-[#1e293b]' : 'bg-slate-50'} text-slate-900 dark:text-slate-50 font-sans selection:bg-indigo-100 dark:selection:bg-indigo-500/30 pb-20 transition-colors duration-300`} onClick={() => { setActiveHighlight(null); setShowUserMenu(false); setActiveMenu(null); }}>
      {/* Top Header */}
      <header className={`sticky top-0 z-50 w-full border-b backdrop-blur-md transition-colors duration-300 ${isDarkMode ? 'bg-[#0f172a]/80 border-slate-800' : 'bg-white/80 border-slate-200'}`}>
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button 
              onClick={(e) => { 
                e.stopPropagation(); 
                if (window.innerWidth >= 1024) {
                  setIsSidebarOpen(!isSidebarOpen);
                } else {
                  setShowMobileMenu(true);
                }
              }}
              className="p-2 -ml-2 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
              aria-label="Toggle Sidebar"
            >
              <Menu className={`w-6 h-6 transition-transform duration-300 ${!isSidebarOpen && window.innerWidth >= 1024 ? 'rotate-180' : ''}`} />
            </button>
            <div className="hidden sm:block w-px h-6 bg-slate-200 dark:bg-slate-800 mx-1" />
            <div className="cursor-pointer flex items-center gap-4" onClick={() => { setCurrentPage(0); setActiveBookItem({ bookId: 'sozler', itemId: 'soz-1' }); }}>
              <div className="flex flex-col">
                <h1 className="text-lg font-black tracking-tight text-slate-900 dark:text-white leading-none">Ya Hakeem</h1>
                <p className="text-[10px] font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-widest mt-0.5">Risale-i Nur</p>
              </div>
                <div className={`hidden lg:flex items-center px-3 py-1.5 rounded-full border self-center ${isDarkMode ? 'bg-slate-900/80 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
                  <span className={`text-[9px] font-black uppercase tracking-tighter ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>
                    {activeBook?.title}
                  </span>
                  <span className={`mx-1.5 ${isDarkMode ? 'text-slate-800' : 'text-slate-300'}`}>/</span>
                  {activeParentItem && (
                    <>
                      <span className={`text-[9px] font-black uppercase tracking-tighter ${isDarkMode ? 'text-emerald-400' : 'text-emerald-600'}`}>
                        {activeParentItem.title}
                      </span>
                      <span className={`mx-1.5 ${isDarkMode ? 'text-slate-800' : 'text-slate-300'}`}>/</span>
                    </>
                  )}
                  <span className={`text-[9px] font-black uppercase tracking-tighter ${activeParentItem ? (isDarkMode ? 'text-indigo-400' : 'text-indigo-600') : (isDarkMode ? 'text-emerald-400' : 'text-emerald-600')}`}>
                    {activeItem?.title}
                  </span>
                </div>
            </div>
          </div>

          <div className="flex items-center gap-1 sm:gap-3">
            {/* Auth */}
            <div className="flex items-center gap-2">
              {user ? (
                <div className="flex items-center gap-2">
                  <div className="hidden sm:flex flex-col items-end mr-1 text-right">
                    <span className="text-[10px] font-black text-slate-600 dark:text-slate-300 uppercase tracking-tighter truncate max-w-[100px]">{user.displayName}</span>
                    <span className="text-[8px] font-bold text-emerald-600 dark:text-emerald-500 uppercase tracking-widest leading-none">Contributor</span>
                  </div>
                  <button 
                    onClick={(e) => { e.stopPropagation(); setShowUserMenu(!showUserMenu); }}
                    className="flex items-center justify-center bg-slate-50 dark:bg-slate-800 p-0.5 rounded-full border border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 transition-colors"
                  >
                    <img src={user.photoURL || ''} alt="" className="w-8 h-8 rounded-full border border-white dark:border-slate-700 shadow-sm" />
                  </button>
                  
                  <AnimatePresence>
                    {showUserMenu && (
                      <motion.div 
                        initial={{ opacity: 0, y: 10, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 10, scale: 0.95 }}
                        className="absolute right-12 top-14 mt-2 w-48 bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-100 dark:border-slate-800 z-50 overflow-hidden py-1"
                      >
                        <div className="px-4 py-3 border-b border-slate-50 dark:border-slate-800 mb-1">
                          <p className="text-[10px] font-black text-slate-400 dark:text-slate-600 uppercase tracking-widest leading-none mb-1">Signed in as</p>
                          <p className="text-xs font-bold text-slate-900 dark:text-white truncate">{user.email}</p>
                        </div>
                        <button 
                          onClick={() => signOut(auth)}
                          className="w-full flex items-center gap-3 px-4 py-3 text-xs font-bold text-rose-500 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors"
                        >
                          <LogOut className="w-4 h-4" /> Sign Out
                        </button>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              ) : (
                <button 
                  onClick={signInWithGoogle}
                  className="px-5 py-2 bg-emerald-600 dark:bg-emerald-700 text-white rounded-full text-[10px] font-black uppercase tracking-widest hover:opacity-90 transition-all shadow-lg shadow-emerald-100 dark:shadow-none"
                >
                  Login
                </button>
              )}
            </div>

            <div className="w-px h-6 bg-slate-200 dark:bg-slate-800 mx-1" />

            <button 
              onClick={(e) => { e.stopPropagation(); setShowSettingsSheet(true); }}
              className="p-2 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-all"
              aria-label="More Settings"
            >
              <MoreVertical className="w-5 h-5" />
            </button>
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
              className="fixed inset-0 z-[90] bg-slate-900/80 backdrop-blur-md"
            />
            <motion.div 
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className={`fixed top-0 left-0 bottom-0 z-[100] w-[280px] shadow-2xl flex flex-col border-r ${isDarkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-100'}`}
              onClick={e => e.stopPropagation()}
            >
              <div className={`p-6 border-b flex items-center justify-between ${isDarkMode ? 'border-slate-800 bg-slate-900' : 'border-slate-100 bg-white'}`}>
                <div className="flex flex-col">
                  <h3 className={`font-black tracking-tight ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>Ya Hakeem</h3>
                  <p className={`text-[10px] font-black uppercase tracking-widest mt-0.5 ${isDarkMode ? 'text-emerald-400' : 'text-emerald-600'}`}>Risale-i Nur</p>
                </div>
                <button onClick={() => setShowMobileMenu(false)} className={`p-2 rounded-full transition-colors ${isDarkMode ? 'bg-slate-900 text-slate-500 hover:text-white' : 'bg-slate-50 text-slate-400 hover:text-slate-900'}`}>
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="flex-1 overflow-hidden">
                <SidebarContent 
                  expandedSection={expandedSection}
                  setExpandedSection={setExpandedSection}
                  expandedItem={expandedItem}
                  setExpandedItem={setExpandedItem}
                  activeBookItem={activeBookItem}
                  setActiveBookItem={setActiveBookItem}
                  setShowMobileMenu={setShowMobileMenu}
                  isDarkMode={isDarkMode}
                />
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <aside 
        className={`fixed top-14 left-0 bottom-0 z-40 transition-all duration-300 ease-in-out hidden lg:block border-r
          ${isDarkMode ? 'bg-[#0f172a] border-slate-800' : 'bg-white border-slate-200'}
          ${isSidebarOpen ? 'w-72' : 'w-0 overflow-hidden border-none opacity-0'}
        `}
      >
        <div className="w-72 h-full">
          <SidebarContent 
            expandedSection={expandedSection}
            setExpandedSection={setExpandedSection}
            expandedItem={expandedItem}
            setExpandedItem={setExpandedItem}
            activeBookItem={activeBookItem}
            setActiveBookItem={setActiveBookItem}
            setShowMobileMenu={setShowMobileMenu}
            isDarkMode={isDarkMode}
          />
        </div>
      </aside>

      {/* Main Content Area */}
      <div 
        className={`transition-all duration-300 ease-in-out min-h-screen pt-14
          ${isSidebarOpen ? 'lg:ml-72' : 'lg:ml-0'}
        `}
      >
        {/* Main List */}
        <main className="max-w-5xl mx-auto px-4 pt-1 pb-4 sm:px-8">
          <header className="mb-2">
            <div className="flex items-center gap-2.5 mb-1 wrap">
              <span className={`px-2.5 py-1 rounded-md text-[10px] font-black uppercase tracking-widest text-white shadow-sm ${activeBook?.color || 'bg-slate-900'}`}>
                {activeBook?.title || 'Library'}
              </span>
              <span className="text-slate-300 text-[10px]">/</span>
              {activeParentItem && (
                <>
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                    {activeParentItem.title}
                  </span>
                  <span className="text-slate-300 text-[10px]">/</span>
                </>
              )}
              <span className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">
                {activeItem?.title}
              </span>
            </div>
            <h2 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight leading-tight">
              {activeItem?.title}
              {activeItem?.detail && (
                <span className="block sm:inline sm:ml-4 text-lg font-medium text-slate-400 dark:text-slate-500 italic font-serif opacity-70">
                   — {activeItem?.detail}
                </span>
              )}
            </h2>
          </header>

          {filteredSentences.length > 0 ? (
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
                        transition={{ 
                          delay: (sIdx % entriesPerPage) * 0.05
                        }}
                        className={`group relative rounded-3xl border overflow-hidden transition-all duration-300 ${isDarkMode ? 'bg-slate-800/80 border-slate-700 hover:border-emerald-500/40 shadow-xl' : 'bg-white border-slate-200 hover:shadow-2xl hover:border-emerald-200'}`}
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
                const wordFont = lang === 'ottoman' ? ottomanFont : lang === 'sorani' ? kurdishFont : turkishFont;

                return (
                  <div key={lang} className={`flex flex-col ${isRTL ? 'text-right' : 'text-left'}`} dir={isRTL ? 'rtl' : 'ltr'}>
                    <div className={`flex items-center gap-2 mb-4 pb-2 border-b border-slate-50 dark:border-slate-800/50 ${isRTL ? 'flex-row-reverse' : 'flex-row'}`}>
                      <div className={`w-3 h-3 rounded-full ${meta.color} ring-4 ring-slate-50 dark:ring-slate-900`} />
                      <span className="text-[10px] font-black uppercase text-slate-400 dark:text-slate-500 tracking-widest">{meta.label}</span>
                    </div>
                            
                            <div 
                              className={`flex flex-wrap gap-x-1 gap-y-2.5 ${wordFont}`}
                              style={{ 
                                fontSize: `${lang === 'turkish' ? turkishFontSize : lang === 'sorani' ? kurdishFontSize : ottomanFontSize}px`, 
                                lineHeight: 1.5
                              }}
                            >
                              {words.map((word, wordIdx) => {
                                const isClicked = highlight?.lang === lang && highlight?.index === wordIdx;
                                const isLinked = mapEntry && mapEntry[lang] === wordIdx && !isClicked;

                                return (
                                  <button
                                    key={wordIdx}
                                    onClick={(e) => handleWordClick(sentence.id, lang, wordIdx, e)}
                                    className={`
                                      relative px-2 py-1.5 rounded-xl transition-all duration-200 cursor-pointer select-none outline-none focus-visible:ring-2 focus-visible:ring-indigo-400
                                      ${wordFont}
                                      ${isClicked ? 'bg-indigo-600 text-white shadow-xl ring-2 ring-indigo-600 z-10 scale-105' : ''}
                                      ${isLinked ? 'bg-emerald-50 dark:bg-emerald-500/20 ring-1 ring-emerald-200 dark:ring-emerald-500/30 text-emerald-900 dark:text-emerald-300 font-bold shadow-sm' : 'text-slate-600 dark:text-slate-100 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-700/50'}
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
                    <div className="absolute top-4 right-4 z-20">
                      <div className="relative">
                        <button 
                          onClick={(e) => { e.stopPropagation(); setActiveMenu(activeMenu === sentence.id ? null : sentence.id); }}
                          className="p-2 text-slate-300 dark:text-slate-600 hover:text-slate-600 dark:hover:text-slate-400 rounded-full hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                        >
                          <MoreVertical className="w-5 h-5" />
                        </button>
                        
                        <AnimatePresence>
                          {activeMenu === sentence.id && (
                            <motion.div 
                              initial={{ opacity: 0, scale: 0.95, y: -10 }}
                              animate={{ opacity: 1, scale: 1, y: 0 }}
                              exit={{ opacity: 0, scale: 0.95, y: -10 }}
                              className="absolute top-12 right-0 w-48 bg-white dark:bg-slate-900 rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.1)] border border-slate-100 dark:border-slate-800 py-2 z-[60] overflow-hidden"
                              onClick={e => e.stopPropagation()}
                            >
                              <button 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  navigator.clipboard.writeText(formatSentenceForShare(sentence));
                                  setActiveMenu(null);
                                }}
                                className="w-full flex items-center gap-3 px-4 py-3 text-[10px] font-black text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors uppercase tracking-widest text-left"
                              >
                                <Copy className="w-4 h-4" />
                                Copy Text
                              </button>

                              <button 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleShare(sentence);
                                  setActiveMenu(null);
                                }}
                                className="w-full flex items-center gap-3 px-4 py-3 text-[10px] font-black text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors uppercase tracking-widest text-left"
                              >
                                <Share2 className="w-4 h-4" />
                                Share
                              </button>

                              <div className="mx-3 my-1 border-t border-slate-50 dark:border-slate-800" />

                              <button 
                                onClick={(e) => { e.stopPropagation(); setFeedbackSentence(sentence); setShowFeedbackModal(true); setActiveMenu(null); }}
                                className="w-full flex items-center gap-3 px-4 py-3 text-[10px] font-black text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-colors uppercase tracking-widest text-left"
                              >
                                <MessageSquare className="w-4 h-4" />
                                Feedback
                              </button>

                              {user && (
                                <>
                                  <div className="mx-3 my-1 border-t border-slate-50 dark:border-slate-800" />
                                  <button 
                                    onClick={(e) => { e.stopPropagation(); setEditingEntry(sentence); setShowCMS(true); setActiveMenu(null); }}
                                    className="w-full flex items-center gap-3 px-4 py-3 text-[10px] font-black text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 transition-colors uppercase tracking-widest text-left"
                                  >
                                    <Edit3 className="w-4 h-4" />
                                    Edit Entry
                                  </button>
                                  <button 
                                    onClick={async (e) => { 
                                      e.stopPropagation(); 
                                      if(confirm("Delete this entry permanently?")) {
                                        try {
                                          await deleteDoc(doc(db, 'sentences', sentence.id));
                                          setActiveMenu(null);
                                        } catch (err) {
                                          handleFirestoreError(err, OperationType.DELETE, 'sentences');
                                        }
                                      }
                                    }}
                                    className="w-full flex items-center gap-3 px-4 py-3 text-[10px] font-black text-rose-500 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors uppercase tracking-widest text-left"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                    Delete
                                  </button>
                                </>
                              )}
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-32 text-center">
             <div className="w-20 h-20 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center mb-6">
                <Database className="w-10 h-10 text-slate-300 dark:text-slate-600" />
             </div>
             <h3 className="text-2xl font-black text-slate-900 dark:text-white">The library is empty</h3>
             <p className="text-sm text-slate-500 dark:text-slate-400 mt-2 max-w-sm">Sign in to begin documenting the Risale-i Nur lexicon through parallel trilingual analysis.</p>
          </div>
        )}

        <footer className="mt-32 pb-16 border-t border-slate-200 dark:border-slate-800 pt-16">
          <div className="flex flex-col items-center text-center">
            <div className="mb-8">
              <h4 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-[0.3em]">Ya Hakeem</h4>
              <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mt-1">Lexical Analysis Engine</p>
            </div>
            
            <div className="flex flex-wrap justify-center gap-x-8 gap-y-4 mb-8">
              <div className="flex flex-col gap-1">
                <span className="text-[9px] font-black text-slate-400 dark:text-slate-600 uppercase tracking-widest">Connect</span>
                <a href="tel:+9647501588515" className="text-xs font-bold text-slate-600 dark:text-slate-300 hover:text-emerald-600 transition-colors tracking-tight">+964 750 158 8515</a>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-[9px] font-black text-slate-400 dark:text-slate-600 uppercase tracking-widest">Support</span>
                <a href="mailto:yahakeemapp@gmail.com" className="text-xs font-bold text-slate-600 dark:text-slate-300 hover:text-emerald-600 transition-colors tracking-tight">yahakeemapp@gmail.com</a>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-[9px] font-black text-slate-400 dark:text-slate-600 uppercase tracking-widest">Location</span>
                <span className="text-xs font-bold text-slate-600 dark:text-slate-300 tracking-tight">Halabja, Kurdistan</span>
              </div>
            </div>

            <div className="flex items-center gap-3 opacity-30">
              <div className="h-px w-8 bg-slate-400" />
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.4em]">© 2026</span>
              <div className="h-px w-8 bg-slate-400" />
            </div>
          </div>
        </footer>
      </main>
    </div>

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

      {/* Mobile Action Sheet (Unified) */}
      <AnimatePresence>
        {activeMenu && !editingEntry && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setActiveMenu(null)}
              className="fixed inset-0 z-[80] bg-slate-900/40 backdrop-blur-sm sm:hidden"
            />
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              className={`fixed bottom-0 left-0 right-0 z-[90] rounded-t-[32px] p-6 pb-12 sm:hidden overflow-hidden ${isDarkMode ? 'bg-slate-900 shadow-2xl' : 'bg-white border-t border-slate-100'}`}
              onClick={e => e.stopPropagation()}
            >
              <div className="w-12 h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full mx-auto mb-8" />
              <div className="space-y-2">
                {(() => {
                  const sentence = sentences.find(s => s.id === activeMenu);
                  if (!sentence) return null;
                  return (
                    <>
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          navigator.clipboard.writeText(formatSentenceForShare(sentence));
                          setActiveMenu(null);
                        }}
                        className="w-full flex items-center gap-4 p-4 text-[11px] font-black text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-2xl transition-colors uppercase tracking-widest text-left"
                      >
                        <div className="p-2.5 bg-slate-50 dark:bg-slate-800 rounded-xl">
                          <Copy className="w-5 h-5" />
                        </div>
                        Copy Parity Text
                      </button>

                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          handleShare(sentence);
                          setActiveMenu(null);
                        }}
                        className="w-full flex items-center gap-4 p-4 text-[11px] font-black text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-2xl transition-colors uppercase tracking-widest text-left"
                      >
                        <div className="p-2.5 bg-slate-50 dark:bg-slate-800 rounded-xl">
                          <Share2 className="w-5 h-5" />
                        </div>
                        Share Analysis
                      </button>

                      <button 
                        onClick={(e) => { e.stopPropagation(); setFeedbackSentence(sentence); setShowFeedbackModal(true); setActiveMenu(null); }}
                        className="w-full flex items-center gap-4 p-4 text-[11px] font-black text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/30 rounded-2xl transition-colors uppercase tracking-widest text-left"
                      >
                        <div className="p-2.5 bg-indigo-50 dark:bg-indigo-900/40 rounded-xl">
                          <MessageSquare className="w-5 h-5" />
                        </div>
                        Submit Feedback
                      </button>

                      {user && (
                        <>
                          <button 
                            onClick={(e) => { e.stopPropagation(); setEditingEntry(sentence); setShowCMS(true); setActiveMenu(null); }}
                            className="w-full flex items-center gap-4 p-4 text-[11px] font-black text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 rounded-2xl transition-colors uppercase tracking-widest text-left"
                          >
                            <div className="p-2.5 bg-emerald-50 dark:bg-emerald-900/40 rounded-xl">
                              <Edit3 className="w-5 h-5" />
                            </div>
                            Edit Lexical Entry
                          </button>
                          <button 
                            onClick={async (e) => { 
                              e.stopPropagation(); 
                              if(confirm("Delete this entry permanently?")) {
                                try {
                                  await deleteDoc(doc(db, 'sentences', sentence.id));
                                  setActiveMenu(null);
                                } catch (err) {
                                  handleFirestoreError(err, OperationType.DELETE, 'sentences');
                                }
                              }
                            }}
                            className="w-full flex items-center gap-4 p-4 text-[11px] font-black text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded-2xl transition-colors uppercase tracking-widest text-left"
                          >
                            <div className="p-2.5 bg-rose-50 dark:bg-rose-900/40 rounded-xl">
                              <Trash2 className="w-5 h-5" />
                            </div>
                            Delete Permanently
                          </button>
                        </>
                      )}
                    </>
                  );
                })()}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Custom Display Settings Modal */}
      <DisplaySettingsSheet 
        show={showSettingsSheet}
        onClose={() => setShowSettingsSheet(false)}
        onReset={resetSettings}
        turkishFont={turkishFont}
        setTurkishFont={setTurkishFont}
        turkishFontSize={turkishFontSize}
        setTurkishFontSize={setTurkishFontSize}
        kurdishFont={kurdishFont}
        setKurdishFont={setKurdishFont}
        kurdishFontSize={kurdishFontSize}
        setKurdishFontSize={setKurdishFontSize}
        ottomanFont={ottomanFont}
        setOttomanFont={setOttomanFont}
        ottomanFontSize={ottomanFontSize}
        setOttomanFontSize={setOttomanFontSize}
        layoutMode={layoutMode}
        setLayoutMode={setLayoutMode}
        visibleLangs={visibleLangs}
        toggleLang={toggleLang}
        isDarkMode={isDarkMode}
        setIsDarkMode={setIsDarkMode}
        DEFAULT_SIZES={DEFAULT_SIZES}
      />

      {/* Floating Action Button */}
      {user && (
        <motion.button
          whileHover={{ scale: 1.1, rotate: 90 }}
          whileTap={{ scale: 0.9 }}
          onClick={(e) => { e.stopPropagation(); setEditingEntry(null); setShowCMS(true); }}
          className="fixed bottom-8 right-8 w-16 h-16 bg-emerald-600 text-white rounded-2xl shadow-2xl shadow-emerald-100 flex items-center justify-center hover:bg-emerald-700 transition-all z-[50]"
        >
          <Plus className="w-8 h-8" />
        </motion.button>
      )}

      {/* Floating Back to Top */}
      <AnimatePresence>
        {showScrollTop && (
            <motion.button
            initial={{ opacity: 0, scale: 0.8, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.8, y: 20 }}
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            onClick={(e) => { e.stopPropagation(); scrollToTop(); }}
            className={`fixed bottom-24 right-8 z-[60] p-4 rounded-2xl shadow-2xl transition-all flex items-center justify-center ${isDarkMode ? 'bg-indigo-600 text-white hover:bg-indigo-500 shadow-indigo-500/20' : 'bg-slate-900 text-white hover:bg-slate-800 shadow-slate-200'}`}
          >
            <ArrowUp className="w-5 h-5" />
          </motion.button>
        )}
      </AnimatePresence>

      {/* Lexical Link Drawer */}
      <AnimatePresence>
        {activeHighlight && (
          <>
            {/* Backdrop for mobile/consistent feel */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setActiveHighlight(null)}
              className="fixed inset-0 z-[60] bg-slate-900/20 backdrop-blur-sm lg:bg-transparent lg:backdrop-blur-none"
            />
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              onClick={e => e.stopPropagation()}
              className="fixed bottom-0 left-0 right-0 z-[70] p-4 lg:p-8 flex justify-center pointer-events-none"
            >
              <div className={`w-full max-w-2xl lg:bg-slate-900/95 lg:backdrop-blur-xl rounded-t-[2.5rem] lg:rounded-[2.5rem] shadow-2xl border pointer-events-auto overflow-hidden transition-colors ${isDarkMode ? 'bg-slate-800 border-slate-700 lg:border-white/10' : 'bg-white border-slate-100'}`}>
                <div className="p-6 lg:p-8">
                  <div className="flex items-center justify-between mb-8">
                    <div className="flex items-center gap-3">
                      <div className="p-2.5 bg-indigo-50 dark:bg-indigo-900/40 lg:bg-white/10 rounded-xl">
                        <Link2 className="w-5 h-5 text-indigo-600 dark:text-indigo-400 lg:text-indigo-400" />
                      </div>
                      <div>
                        <h3 className="font-black text-slate-900 dark:text-white uppercase tracking-[0.2em] text-[10px]">Lexical Harmony</h3>
                        <p className={`text-[9px] font-bold uppercase tracking-wider ${isDarkMode ? 'text-slate-400' : 'text-slate-400'}`}>Cross-Linguistic Mapping</p>
                      </div>
                    </div>
                    <button 
                      onClick={() => setActiveHighlight(null)}
                      className={`p-2 rounded-full transition-colors ${isDarkMode ? 'hover:bg-white/10 text-slate-500 hover:text-white' : 'hover:bg-slate-100 text-slate-300 hover:text-slate-600'}`}
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 lg:gap-8">
                    {Object.entries(LANG_META).map(([langKey, meta]) => {
                       const l = langKey as Language;
                       const activeSent = sentences.find(s => s.id === activeHighlight.sentenceId);
                       const entry = activeSent ? getMapEntry(activeSent, activeHighlight) : null;
                       const idx = entry ? entry[l] : null;
                       const isSource = l === activeHighlight.lang;
                       const word = (activeSent && idx !== null) ? activeSent[l][idx] : '—';

                       return (
                         <div 
                           key={l} 
                           className={`p-5 rounded-3xl transition-all duration-500 ${
                             isSource 
                               ? (isDarkMode ? 'bg-slate-700/50 border border-slate-600 ring-2 ring-indigo-500/20 shadow-inner' : 'bg-slate-50 border border-slate-100 ring-2 ring-indigo-500/20') 
                               : (isDarkMode ? 'bg-slate-800/40 border border-slate-700/50 hover:bg-slate-800/60' : 'bg-white lg:bg-transparent border border-transparent')
                           }`}
                         >
                           <div className="flex items-center justify-between mb-4">
                             <div className="flex items-center gap-2">
                               <div className={`w-1.5 h-1.5 rounded-full ${meta.color}`} />
                               <span className="text-[9px] font-black text-slate-400 lg:text-slate-500 uppercase tracking-widest">{meta.label}</span>
                             </div>
                             {isSource && (
                               <span className="text-[8px] font-black bg-indigo-500 text-white px-2 py-0.5 rounded-full uppercase">Source</span>
                             )}
                           </div>
                           <div className={`${meta.rtl ? 'text-right' : 'text-left'}`}>
                             <span className={`text-xl lg:text-2xl leading-tight ${
                               meta.rtl 
                                 ? 'font-serif text-slate-900 dark:text-slate-100 lg:text-indigo-50 font-medium' 
                                 : 'font-serif font-bold text-slate-900 dark:text-white lg:text-white'
                             }`}>
                               {word}
                             </span>
                           </div>
                         </div>
                       );
                    })}
                  </div>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showFeedbackModal && feedbackSentence && (
          <FeedbackModal 
            sentence={feedbackSentence}
            metadata={getMetadataString(feedbackSentence)}
            onClose={() => { setShowFeedbackModal(false); setFeedbackSentence(null); }}
            isDarkMode={isDarkMode}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showCMS && user && (
          <CMSModal 
            user={user}
            isDarkMode={isDarkMode}
            initialData={editingEntry}
            onClose={() => { setShowCMS(false); setEditingEntry(null); }} 
            onSave={async (data) => {
              try {
                const payload = {
                  ...data,
                  bookId: activeBookItem?.bookId || 'sozler',
                  itemId: activeBookItem?.itemId || 'soz-1'
                };
                if (editingEntry) {
                   await updateDoc(doc(db, 'sentences', editingEntry.id), { ...payload, updatedAt: serverTimestamp() });
                } else {
                   await addDoc(collection(db, 'sentences'), { ...payload, authorId: user.uid, createdAt: serverTimestamp() });
                }
                setShowCMS(false);
                setEditingEntry(null);
                setShowSavedToast(true);
                setTimeout(() => setShowSavedToast(false), 2000);
              } catch (e) { 
                handleFirestoreError(e, editingEntry ? OperationType.UPDATE : OperationType.CREATE, 'sentences'); 
              }
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// --- Feedback Modal Component ---

function FeedbackModal({ sentence, metadata, onClose, isDarkMode }: { sentence: Sentence, metadata: string, onClose: () => void, isDarkMode: boolean }) {
  const [formData, setFormData] = useState({ name: '', contact: '', text: '' });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    // Simulate submission
    await new Promise(resolve => setTimeout(resolve, 1000));
    alert('Thank you for your feedback! It has been submitted.');
    onClose();
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className={`fixed inset-0 z-[1000] backdrop-blur-sm flex items-center justify-center p-4 ${isDarkMode ? 'bg-slate-900/80' : 'bg-slate-900/40'}`}
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        onClick={e => e.stopPropagation()}
        className={`w-full max-w-lg bg-white dark:bg-slate-900 rounded-[2.5rem] shadow-2xl overflow-hidden border border-slate-100 dark:border-slate-800`}
      >
        <div className={`p-8 pb-4 ${isDarkMode ? 'bg-slate-800 text-slate-100' : 'bg-white text-slate-900'}`}>
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-indigo-50 dark:bg-indigo-900/40 rounded-xl">
                <MessageSquare className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
              </div>
              <div>
                <h3 className="font-black text-slate-900 dark:text-white uppercase tracking-[0.2em] text-[10px]">Feedback</h3>
                <p className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Help improve the lexicon</p>
              </div>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors text-slate-300 dark:text-slate-600 hover:text-slate-600 dark:hover:text-slate-300">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-2xl border border-slate-100 dark:border-slate-800 mb-6">
            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Context</p>
            <p className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 truncate uppercase mt-1">{metadata}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 line-clamp-1 italic">"{sentence.turkish.slice(0, 5).join(' ')}..."</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-[9px] font-black uppercase text-slate-400 dark:text-slate-500 tracking-widest ml-1">Name</label>
                <input 
                  required
                  type="text" 
                  value={formData.name}
                  onChange={e => setFormData(p => ({ ...p, name: e.target.value }))}
                  className="w-full bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-xl p-3 text-xs font-bold focus:ring-2 focus:ring-indigo-500 outline-none transition-all dark:text-white"
                  placeholder="John Doe"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[9px] font-black uppercase text-slate-400 dark:text-slate-500 tracking-widest ml-1">Email / Phone</label>
                <input 
                  required
                  type="text" 
                  value={formData.contact}
                  onChange={e => setFormData(p => ({ ...p, contact: e.target.value }))}
                  className="w-full bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-xl p-3 text-xs font-bold focus:ring-2 focus:ring-indigo-500 outline-none transition-all dark:text-white"
                  placeholder="name@email.com"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-[9px] font-black uppercase text-slate-400 dark:text-slate-500 tracking-widest ml-1">Your Message</label>
              <textarea 
                required
                rows={4}
                value={formData.text}
                onChange={e => setFormData(p => ({ ...p, text: e.target.value }))}
                className="w-full bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-xl p-3 text-xs font-bold focus:ring-2 focus:ring-indigo-500 outline-none transition-all dark:text-white resize-none"
                placeholder="What can we improve?"
              />
            </div>
            <button 
              disabled={isSubmitting}
              type="submit"
              className="w-full py-4 bg-slate-900 dark:bg-indigo-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] shadow-lg hover:opacity-90 transition-all active:scale-[0.98] disabled:opacity-50"
            >
              {isSubmitting ? 'Submitting...' : 'Submit Feedback'}
            </button>
          </form>
        </div>
        <div className="p-6 pt-0" />
      </motion.div>
    </motion.div>
  );
}

// --- CMS Modal Component ---

interface CMSModalProps {
  user: User;
  isDarkMode: boolean;
  initialData?: Sentence | null;
  onClose: () => void;
  onSave: (data: Omit<Sentence, 'id' | 'authorId' | 'createdAt' | 'bookId' | 'itemId'>) => Promise<void>;
}

function CMSModal({ user, isDarkMode, initialData, onClose, onSave }: CMSModalProps) {
  const [showScrollTop, setShowScrollTop] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const handleModalScroll = () => {
    if (scrollRef.current) {
      setShowScrollTop(scrollRef.current.scrollTop > 300);
    }
  };

  const scrollToModalTop = () => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const [inputs, setInputs] = useState<Record<Language, string>>(() => {
    if (initialData) {
      return {
        ottoman: initialData.ottoman.join(' '),
        sorani: initialData.sorani.join(' '),
        turkish: initialData.turkish.join(' ')
      };
    }
    return {
      ottoman: '',
      sorani: '',
      turkish: '',
    };
  });
  const [wordMaps, setWordMaps] = useState<WordMap[]>(initialData ? initialData.wordMap : [{ ottoman: null, sorani: null, turkish: null }]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [aiProcessing, setAiProcessing] = useState<string | null>(null);

  const tokens = useMemo(() => {
    return {
      ottoman: inputs.ottoman.trim().split(/\s+/).filter(Boolean),
      sorani: inputs.sorani.trim().split(/\s+/).filter(Boolean),
      turkish: inputs.turkish.trim().split(/\s+/).filter(Boolean)
    };
  }, [inputs]);
  const playSuccessSound = () => {
    try {
      const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2432/2432-preview.mp3');
      audio.volume = 0.4;
      audio.play().catch(e => console.log('Audio play failed:', e));
    } catch (e) {}
  };

  const playErrorSound = () => {
    try {
      const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2571/2571-preview.mp3');
      audio.volume = 0.3;
      audio.play().catch(e => console.log('Audio play failed:', e));
    } catch (e) {}
  };

  const handleTranslate = async () => {
    if (!inputs.ottoman.trim()) {
      setError("Please provide Ottoman text first.");
      playErrorSound();
      return;
    }
    setAiProcessing('translating');
    setError(null);
    try {
      const translated = await translateToSorani(inputs.ottoman);
      setInputs(prev => ({ ...prev, sorani: translated }));
      playSuccessSound();
    } catch (err) {
      setError("AI Translation failed. Please try again.");
      playErrorSound();
    } finally {
      setAiProcessing(null);
    }
  };

  const handleAutoMap = async () => {
    if (!tokens.ottoman.length || !tokens.sorani.length || !tokens.turkish.length) {
      setError("Please provide text for all languages before mapping.");
      playErrorSound();
      return;
    }
    setAiProcessing('mapping');
    setError(null);
    try {
      const mappings = await autoMapIndices(tokens.ottoman, tokens.sorani, tokens.turkish);
      setWordMaps(mappings);
      playSuccessSound();
    } catch (err) {
      setError("AI Word Mapping failed.");
      playErrorSound();
    } finally {
      setAiProcessing(null);
    }
  };

  const syncOttomanTurkish = () => {
    const maxLen = Math.max(tokens.ottoman.length, tokens.turkish.length);
    const newMaps: WordMap[] = [];
    for (let i = 0; i < maxLen; i++) {
      newMaps.push({
        ottoman: i < tokens.ottoman.length ? i : null,
        turkish: i < tokens.turkish.length ? i : null,
        sorani: null
      });
    }
    setWordMaps(newMaps);
    playSuccessSound();
  };

  const handleSave = async () => {
    if (!tokens.ottoman.length || !tokens.sorani.length || !tokens.turkish.length) {
      setError("Please provide text for all three languages.");
      playErrorSound();
      return;
    }
    
    setSaving(true);
    setError(null);
    try {
      await onSave({
        ottoman: tokens.ottoman,
        sorani: tokens.sorani,
        turkish: tokens.turkish,
        wordMap: wordMaps.filter(m => m.ottoman !== null || m.sorani !== null || m.turkish !== null)
      });
      playSuccessSound();
    } catch (err: any) {
      let msg = "Failed to save entry.";
      try {
        const detail = JSON.parse(err.message);
        if (detail.error) msg = `Error: ${detail.error}`;
      } catch (e) {
        if (err.message) msg = err.message;
      }
      setError(msg);
      playErrorSound();
    } finally {
      setSaving(false);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className={`fixed inset-0 z-[1000] backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 ${isDarkMode ? 'bg-slate-900/80' : 'bg-slate-900/40'}`}
      onClick={onClose}
    >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              onClick={e => e.stopPropagation()}
              className={`w-full max-w-2xl rounded-2xl shadow-2xl flex flex-col max-h-[90vh] border overflow-hidden ${isDarkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-100 text-slate-900'}`}
            >
            {/* Modal Header */}
            <div className={`p-6 border-b flex items-center justify-between ${isDarkMode ? 'border-slate-700 bg-slate-800/50' : 'border-slate-100 bg-slate-50/30'} backdrop-blur-md`}>
              <div className="flex items-center gap-3">
                <div className="p-2 bg-emerald-500 rounded-xl shadow-lg shadow-emerald-500/20">
                  <Edit3 className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h2 className="text-sm font-black uppercase tracking-[0.1em] text-slate-800 dark:text-white">{initialData ? 'Edit Sentence Pair' : 'New Parallel Entry'}</h2>
                  <p className="text-[10px] font-bold text-slate-400 dark:text-slate-400 uppercase tracking-tight">Data Integrity Control</p>
                </div>
              </div>
              <button 
                onClick={onClose} 
                className={`p-2 rounded-xl transition-all ${isDarkMode ? 'hover:bg-slate-700 text-slate-500' : 'hover:bg-slate-100 text-slate-400 font-bold hover:text-slate-900'}`}
              >
                <X className="w-6 h-6 text-slate-400 dark:text-slate-500" />
              </button>
            </div>
    
            {/* Modal Body (Scrollable) */}
            <div 
              ref={scrollRef}
              onScroll={handleModalScroll}
              className="flex-1 overflow-y-auto p-6 sm:p-8 space-y-10 font-sans relative"
            >
              <AnimatePresence>
                {showScrollTop && (
                  <motion.button
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    onClick={(e) => { e.stopPropagation(); scrollToModalTop(); }}
                    className={`sticky bottom-4 left-1/2 -translate-x-1/2 z-50 p-3 rounded-full shadow-lg transition-all active:scale-95 flex items-center justify-center ${isDarkMode ? 'bg-slate-700 text-white border border-slate-600' : 'bg-slate-100 text-slate-800 border border-slate-200'} opacity-80 hover:opacity-100`}
                  >
                    <ArrowUp className="w-4 h-4" />
                  </motion.button>
                )}
              </AnimatePresence>
              <div className="space-y-8">
                {(['ottoman', 'sorani', 'turkish'] as Language[]).map(lang => (
                  <div key={lang} className="group space-y-3">
                    <div className="flex items-center justify-between">
                      <label className="text-[10px] font-black uppercase text-slate-500 dark:text-slate-400 tracking-[0.15em] ml-1">
                        {LANG_META[lang].label}
                      </label>
                      {lang === 'sorani' && (
                         <button 
                           onClick={handleTranslate}
                           disabled={!!aiProcessing}
                           className="flex items-center gap-2 px-3 py-1 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-300 rounded-lg text-[9px] font-black uppercase tracking-wider hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition-all disabled:opacity-50 border border-indigo-100 dark:border-indigo-800"
                         >
                           {aiProcessing === 'translating' ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                           {aiProcessing === 'translating' ? 'translating...' : 'AI Translate'}
                         </button>
                      )}
                    </div>
                    <textarea
                      value={inputs[lang]}
                      onChange={e => setInputs(prev => ({ ...prev, [lang]: e.target.value }))}
                      dir={LANG_META[lang].rtl ? 'rtl' : 'ltr'}
                      className={`w-full p-5 rounded-[2rem] border focus:ring-4 focus:ring-indigo-500/10 outline-none transition-all resize-none shadow-sm ${isDarkMode ? 'bg-slate-900 border-slate-700 text-white focus:border-indigo-500 placeholder:text-slate-700' : 'bg-white border-slate-200 text-slate-900 focus:border-indigo-400 placeholder:text-slate-300'}
                        ${LANG_META[lang].rtl ? 'font-serif text-2xl leading-relaxed' : 'text-sm font-medium leading-relaxed'}
                      `}
                      rows={3}
                      placeholder={`Enter ${LANG_META[lang].label} text here...`}
                    />
                    <div className="flex flex-wrap gap-2 px-2">
                      {tokens[lang].map((t, i) => (
                        <span key={i} className={`px-2.5 py-1.5 rounded-xl border flex items-center gap-2 transition-all opacity-80 hover:opacity-100 ${isDarkMode ? 'bg-slate-800 border-slate-700 text-slate-300' : 'bg-slate-50 border-slate-200 text-slate-500'}`}>
                          <span className="text-[8px] font-black uppercase text-indigo-500/50">{i}</span>
                          <span className={`${LANG_META[lang].rtl ? 'font-serif text-sm' : 'text-[11px] font-bold'}`}>{t}</span>
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
      
                <div className="pt-8 border-t border-slate-100 dark:border-slate-800">
                  <div className="flex items-center justify-between mb-6">
                    <div>
                      <h3 className="text-xs font-black uppercase text-slate-800 dark:text-white tracking-[0.1em]">Relational word mapping</h3>
                      <p className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase">Synchronize translations</p>
                    </div>
                    <div className="flex items-center gap-2">
                    <button 
                      onClick={handleAutoMap}
                      disabled={!!aiProcessing}
                      className="flex items-center gap-2 px-3 py-1.5 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-800 rounded-xl text-[9px] font-black uppercase tracking-wider hover:bg-emerald-100 dark:hover:bg-emerald-900/50 transition-all disabled:opacity-50"
                    >
                      {aiProcessing === 'mapping' ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                      {aiProcessing === 'mapping' ? 'AI Mapping' : 'Auto Map'}
                    </button>
                    <button 
                      onClick={syncOttomanTurkish}
                      className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 border border-blue-100 dark:border-blue-800 rounded-xl text-[9px] font-black uppercase tracking-wider hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-all"
                    >
                      <Link2 className="w-3.5 h-3.5" />
                      Link OT-TR
                    </button>
                    </div>
                  </div>
                  
                  <div className="space-y-3">
                    {wordMaps.map((map, i) => (
                      <div key={i} className={`flex items-center gap-4 p-4 rounded-2xl border transition-all ${isDarkMode ? 'bg-slate-900/50 border-slate-700' : 'bg-slate-50 border-slate-200'} group`}>
                        <div className="flex-1 grid grid-cols-3 gap-3">
                        {(['ottoman', 'sorani', 'turkish'] as Language[]).map((l) => {
                          return (
                            <div key={l} className="space-y-1.5 text-center">
                              <label className="text-[7px] font-black uppercase text-slate-400 dark:text-slate-600 tracking-tighter">{l}</label>
                              <input
                                type="number"
                                placeholder="—"
                                value={map[l] ?? ''}
                                onChange={e => {
                                  const val = e.target.value === '' ? null : parseInt(e.target.value);
                                  setWordMaps(prev => {
                                    const next = [...prev];
                                    next[i] = { ...next[i], [l]: val };
                                    return next;
                                  });
                                }}
                                className={`w-full p-2 text-center text-xs font-black rounded-lg border transition-all ${isDarkMode ? 'bg-slate-800 border-slate-700 text-white focus:border-indigo-500' : 'bg-white border-slate-200 text-slate-900 focus:border-indigo-400'}`}
                              />
                            </div>
                          );
                        })}
                        </div>
                        <button 
                          onClick={() => setWordMaps(prev => prev.filter((_, idx) => idx !== i))}
                          className="p-2 text-slate-300 dark:text-slate-600 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/10 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                  
                  <button 
                    onClick={() => setWordMaps(prev => [...prev, { ottoman: null, sorani: null, turkish: null }])}
                    className="mt-6 w-full py-4 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-2xl text-slate-400 dark:text-slate-500 text-[10px] font-black hover:border-indigo-400 dark:hover:border-indigo-800 hover:text-indigo-600 dark:hover:text-indigo-400 transition-all uppercase tracking-[0.2em] bg-transparent"
                  >
                    + Append alignment row
                  </button>
                </div>
              </div>
            </div>

            {/* Modal Footer (Fixed) */}
            <div className={`p-6 border-t ${isDarkMode ? 'border-slate-700 bg-slate-800/80 shadow-[0_-10px_20px_rgba(0,0,0,0.2)]' : 'border-slate-100 bg-white shadow-[0_-10px_20px_rgba(0,0,0,0.05)]'} backdrop-blur-md`}>
              {error && (
                <div className="mb-6 p-4 bg-red-50 dark:bg-red-950/30 border border-red-100 dark:border-red-900/30 rounded-2xl flex items-center gap-3">
                  <div className="p-1 px-2 bg-white dark:bg-red-500 rounded-md shadow-sm">
                    <AlertTriangle className="w-3 h-3 text-red-500 dark:text-white" />
                  </div>
                  <p className="grow text-[11px] font-bold text-red-600 dark:text-red-400 leading-tight">{error}</p>
                </div>
              )}
    
              <div className="flex gap-4">
                <button 
                  onClick={onClose}
                  disabled={saving}
                  className={`flex-1 py-4 text-[10px] font-black uppercase tracking-[0.2em] rounded-2xl transition-all disabled:opacity-50 border ${isDarkMode ? 'hover:bg-slate-700 text-slate-400 border-slate-700' : 'hover:bg-slate-50 text-slate-500 border-slate-100 font-bold hover:text-slate-900 active:scale-95'}`}
                >
                  Terminate
                </button>
                <button 
                  onClick={handleSave}
                  disabled={saving}
                  className={`flex-[2] py-4 rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] shadow-xl transition-all active:scale-[0.98] flex items-center justify-center gap-3 disabled:opacity-50 ${isDarkMode ? 'bg-indigo-600 text-white hover:bg-indigo-500' : 'bg-slate-900 text-white hover:bg-slate-800 font-bold'}`}
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
                    Archive Changes
                  </>
                )}
              </button>
            </div>
          </div>
      </motion.div>
    </motion.div>
  );
}
