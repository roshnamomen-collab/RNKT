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
  Type,
  MoreVertical,
  Edit3,
  Link2,
  Sun,
  Moon,
  Share2,
  Copy,
  AlertTriangle,
  MessageSquare,
  Check
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
}

const SidebarContent = React.memo(({ 
  expandedSection, 
  setExpandedSection, 
  expandedItem, 
  setExpandedItem, 
  activeBookItem, 
  setActiveBookItem, 
  setShowMobileMenu
}: SidebarContentProps) => (
  <div className="flex flex-col h-full uppercase dark:bg-slate-900 transition-colors">
    <div className="flex-1 overflow-y-auto p-4 space-y-6">
      <section>
        <label className="text-[10px] font-black uppercase text-slate-400 dark:text-slate-500 tracking-widest block mb-4 px-2">Risale-i Nur Collection</label>
        <div className="space-y-2">
          {RISALE_SECTIONS.map(s => {
            const isExpanded = expandedSection === s.id;
            return (
              <div key={s.id} className="space-y-1">
                <button 
                  onClick={() => setExpandedSection(isExpanded ? null : s.id)}
                  className={`w-full flex items-center justify-between p-3 rounded-2xl transition-all text-left ${isExpanded ? 'bg-slate-50 dark:bg-slate-800' : 'hover:bg-slate-50 dark:hover:bg-slate-800'}`}
                >
                  <div className="flex items-center gap-2">
                    <div className={`w-1 h-5 rounded-full ${s.color} transition-all ${isExpanded ? 'opacity-100' : 'opacity-20 translate-x-[-2px]'}`} />
                    <div>
                      <p className={`text-[11px] font-black uppercase tracking-tight ${isExpanded ? 'text-slate-900 dark:text-white' : 'text-slate-700 dark:text-slate-300'}`}>{s.title}</p>
                    </div>
                  </div>
                  <ChevronDown className={`w-4 h-4 text-slate-300 transition-transform duration-300 ${isExpanded ? 'rotate-180 text-slate-600 dark:text-slate-400' : ''}`} />
                </button>
                
                <AnimatePresence>
                  {isExpanded && (
                    <motion.div 
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden bg-slate-50/50 dark:bg-slate-800/50 rounded-2xl mx-1"
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
                                className={`w-full flex items-center justify-between p-2 px-4 rounded-xl text-left transition-all ${isActive ? 'bg-white dark:bg-slate-700 shadow-sm' : 'hover:bg-white/50 dark:hover:bg-slate-700/50'}`}
                              >
                                <div className="flex items-center gap-2">
                                  <div className={`w-1 h-1 rounded-full ${isActive ? 'bg-emerald-500' : 'bg-slate-200 dark:bg-slate-700'}`} />
                                  <div>
                                    <p className={`text-[10px] font-bold uppercase tracking-tight ${isActive ? 'text-emerald-700 dark:text-emerald-400' : 'text-slate-500 dark:text-slate-400'}`}>{item.title}</p>
                                    {item.detail && isLeaf && <p className="text-[8px] text-slate-400 dark:text-slate-500 font-medium truncate max-w-[140px]">{item.detail}</p>}
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
                                    className="overflow-hidden bg-slate-100/50 dark:bg-slate-800/50 rounded-lg mx-2"
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
                                            className={`w-full py-1.5 px-6 text-left transition-all text-[9px] font-bold uppercase tracking-tight ${isSiActive ? 'text-emerald-600 dark:text-emerald-400 bg-white/80 dark:bg-slate-700' : 'text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-white/40'}`}
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
    <div className="p-6 bg-slate-50 dark:bg-slate-900/50 border-t border-slate-100 dark:border-slate-800/50 italic text-[9px] text-slate-400 dark:text-slate-500 text-center leading-relaxed">
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
  DEFAULT_SIZES
}: any) => {
  if (!show) return null;
  
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
    <div className="flex flex-wrap gap-1.5">
      {options.map((opt: any) => (
        <button
          key={opt.id}
          onClick={() => setter(opt.id)}
          className={`px-2.5 py-1.5 rounded-lg text-[9px] font-black uppercase transition-all border ${
            value === opt.id 
              ? 'bg-slate-900 dark:bg-indigo-600 border-slate-900 dark:border-indigo-600 text-white shadow-sm' 
              : 'bg-white dark:bg-slate-800 border-slate-100 dark:border-slate-700 text-slate-400 dark:text-slate-500 hover:border-slate-300 dark:hover:border-slate-600 hover:text-slate-600 dark:hover:text-slate-300'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );

  const SizeStepper = ({ value, setter, defaultSize }: any) => (
    <div className="flex items-center gap-2">
      <div className="flex items-center p-1 bg-slate-100 dark:bg-slate-800 rounded-xl border border-slate-200/50 dark:border-slate-700/50">
        <button 
          onClick={() => setter(Math.max(12, value - 1))}
          className="w-7 h-7 flex items-center justify-center bg-white dark:bg-slate-700 rounded-lg shadow-sm text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white active:scale-95 transition-all"
        >
          <Minus className="w-3 h-3" />
        </button>
        <div className="min-w-[2.2rem] text-center">
          <span className="text-[10px] font-black text-slate-700 dark:text-slate-300">{value}</span>
        </div>
        <button 
          onClick={() => setter(Math.min(48, value + 1))}
          className="w-7 h-7 flex items-center justify-center bg-white dark:bg-slate-700 rounded-lg shadow-sm text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white active:scale-95 transition-all"
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
        className="fixed inset-0 z-[100] bg-slate-950/20 backdrop-blur-[2px] flex items-end sm:items-center justify-center p-4 focus:outline-none"
      >
        <motion.div 
          initial={{ opacity: 0, scale: 0.98, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.98, y: 15 }}
          transition={{ duration: 0.2, ease: "circOut" }}
          onClick={e => e.stopPropagation()}
          className="w-full max-w-lg bg-white rounded-[2.5rem] shadow-2xl overflow-hidden border border-slate-100"
        >
          <div className="p-6 border-b border-slate-50 flex items-center justify-between bg-white/80 backdrop-blur-md">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-indigo-50 rounded-xl">
                <Settings2 className="w-5 h-5 text-indigo-600" />
              </div>
              <div>
                <h3 className="font-black text-slate-900 dark:text-white uppercase tracking-[0.2em] text-[10px]">Display Preferences</h3>
                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Interface Calibration</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button 
                onClick={onReset}
                title="Reset to defaults"
                className="p-2 hover:bg-slate-50 rounded-full text-slate-300 hover:text-slate-600 transition-colors"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
              <button onClick={onClose} className="p-2 hover:bg-slate-50 rounded-full transition-colors text-slate-300 hover:text-slate-500">
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>
          
          <div className="p-6 space-y-10 overflow-y-auto max-h-[75vh]">
            <div className="grid grid-cols-2 gap-6">
              <section className="space-y-3">
                <label className="text-[9px] font-black uppercase text-slate-400 dark:text-slate-500 tracking-[0.15em] ml-1">Visible</label>
                <div className="flex bg-slate-50 dark:bg-slate-800/50 p-1 rounded-2xl border border-slate-100/50 dark:border-slate-800/50">
                  {(['ottoman', 'sorani', 'turkish'] as Language[]).map(l => (
                    <button
                      key={l}
                      onClick={() => toggleLang(l)}
                      className={`flex-1 py-2 text-[9px] font-black uppercase rounded-xl transition-all ${
                        visibleLangs.includes(l) 
                          ? `${l === 'ottoman' ? 'bg-indigo-600 text-white shadow-sm' : l === 'sorani' ? 'bg-emerald-600 text-white shadow-sm' : 'bg-rose-600 text-white shadow-sm'}` 
                          : 'text-slate-300 dark:text-slate-600 hover:text-slate-500 dark:hover:text-slate-400'
                      }`}
                    >
                      {l.slice(0,3)}
                    </button>
                  ))}
                </div>
              </section>

              <section className="space-y-3">
                <label className="text-[9px] font-black uppercase text-slate-400 dark:text-slate-500 tracking-[0.15em] ml-1">Layout</label>
                <div className="flex bg-slate-50 dark:bg-slate-800/50 p-1 rounded-2xl border border-slate-100/50 dark:border-slate-800/50">
                  <button 
                    onClick={() => setLayoutMode('side-by-side')}
                    className={`flex-1 flex items-center justify-center py-2 rounded-xl text-[9px] font-black uppercase transition-all ${layoutMode === 'side-by-side' ? 'bg-white dark:bg-slate-700 shadow-sm text-slate-900 dark:text-white' : 'text-slate-300 dark:text-slate-600 hover:text-slate-500 dark:hover:text-slate-400'}`}
                  >
                    <LayoutGrid className="w-3.5 h-3.5" />
                  </button>
                  <button 
                    onClick={() => setLayoutMode('stacked')}
                    className={`flex-1 flex items-center justify-center py-2 rounded-xl text-[9px] font-black uppercase transition-all ${layoutMode === 'stacked' ? 'bg-white dark:bg-slate-700 shadow-sm text-slate-900 dark:text-white' : 'text-slate-300 dark:text-slate-600 hover:text-slate-500 dark:hover:text-slate-400'}`}
                  >
                    <LayoutList className="w-3.5 h-3.5" />
                  </button>
                </div>
              </section>
            </div>

            <section className="space-y-6">
              <label className="text-[9px] font-black uppercase text-slate-400 dark:text-slate-500 tracking-[0.15em] block ml-1">Typography & Sizing</label>
              
              <div className="space-y-6">
                {[
                  { id: 'turkish', label: 'Turkish', value: turkishFont, setter: setTurkishFont, size: turkishFontSize, sizeSetter: setTurkishFontSize, options: turkishOptions, defaultSize: DEFAULT_SIZES?.turkish },
                  { id: 'kurdish', label: 'Kurdish', value: kurdishFont, setter: setKurdishFont, size: kurdishFontSize, sizeSetter: setKurdishFontSize, options: arabicOptions, defaultSize: DEFAULT_SIZES?.kurdish },
                  { id: 'ottoman', label: 'Ottoman', value: ottomanFont, setter: setOttomanFont, size: ottomanFontSize, sizeSetter: setOttomanFontSize, options: arabicOptions, defaultSize: DEFAULT_SIZES?.ottoman },
                ].map(group => (
                  <div key={group.id} className="space-y-4 p-5 rounded-3xl border border-slate-100 dark:border-slate-800 bg-slate-50/30 dark:bg-slate-800/20">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-7 h-7 rounded-lg bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 flex items-center justify-center shadow-sm">
                          <span className="text-[9px] font-black text-slate-400 dark:text-slate-500">{group.label[0]}</span>
                        </div>
                        <span className="text-[10px] font-black text-slate-800 dark:text-slate-200 uppercase tracking-widest">{group.label}</span>
                      </div>
                      <SizeStepper value={group.size} setter={group.sizeSetter} defaultSize={group.defaultSize} />
                    </div>
                    <FontSelector value={group.value} setter={group.setter} options={group.options} />
                  </div>
                ))}
              </div>
            </section>
          </div>
          
          <div className="p-6 pt-2">
            <button 
              onClick={onClose}
              className="w-full py-4 bg-slate-900 text-white rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] shadow-lg hover:bg-slate-800 transition-all active:scale-[0.98]"
            >
              Apply Settings
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
      localStorage.setItem('theme', 'dark');
    } else {
      root.classList.remove('dark');
      localStorage.setItem('theme', 'light');
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
    <div className={`min-h-screen ${isDarkMode ? 'dark bg-slate-950 transition-colors duration-300' : 'bg-slate-50'} text-slate-900 dark:text-slate-100 font-sans selection:bg-indigo-100 dark:selection:bg-indigo-500/30 pb-20`} onClick={() => { setActiveHighlight(null); setShowUserMenu(false); setActiveMenu(null); }}>
      {/* Top Header */}
      <header className="sticky top-0 z-50 w-full bg-white/80 dark:bg-slate-900/90 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 transition-colors duration-300">
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
                <div className="hidden lg:flex items-center px-3 py-1.5 bg-slate-50 dark:bg-slate-800 rounded-full border border-slate-200 dark:border-slate-700 self-center">
                  <span className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-tighter">
                    {activeBook?.title}
                  </span>
                  <span className="mx-1.5 text-slate-300 dark:text-slate-700">/</span>
                  {activeParentItem && (
                    <>
                      <span className="text-[9px] font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-tighter">
                        {activeParentItem.title}
                      </span>
                      <span className="mx-1.5 text-slate-300 dark:text-slate-700">/</span>
                    </>
                  )}
                  <span className={`text-[9px] font-black uppercase tracking-tighter ${activeParentItem ? 'text-indigo-600 dark:text-indigo-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                    {activeItem?.title}
                  </span>
                </div>
            </div>
          </div>

          <div className="flex items-center gap-1 sm:gap-3">
             <button 
              onClick={(e) => { e.stopPropagation(); setIsDarkMode(!isDarkMode); }}
              className="p-2 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-all"
              aria-label="Toggle theme"
             >
               {isDarkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
             </button>

            {/* Desktop Actions */}
            <div className="hidden md:flex items-center gap-4 pr-1 sm:pr-4 border-r border-slate-200 dark:border-slate-800">
               <button 
                onClick={(e) => { e.stopPropagation(); setShowSettingsSheet(true); }}
                className="flex items-center gap-2 px-3 py-2 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-all font-black text-[10px] uppercase tracking-widest"
               >
                 <Settings2 className="w-4 h-4" />
                 Display
               </button>
               
               <div className="flex items-center gap-1.5">
                 {(['ottoman', 'sorani', 'turkish'] as Language[]).map(l => (
                   <button
                    key={l}
                    onClick={() => toggleLang(l)}
                    className={`px-2.5 py-1 text-[10px] font-black uppercase rounded-lg border transition-all ${
                      visibleLangs.includes(l) 
                        ? `${l === 'ottoman' ? 'bg-indigo-50 border-indigo-200 text-indigo-700' : l === 'sorani' ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-rose-50 border-rose-200 text-rose-700'}` 
                        : 'bg-white border-slate-200 text-slate-300 shadow-sm'
                    }`}
                   >
                    {l.slice(0,3)}
                   </button>
                 ))}
               </div>
            </div>

            {/* Mobile Actions */}
            <div className="flex md:hidden items-center gap-1">
              <button 
                onClick={(e) => { e.stopPropagation(); setShowSettingsSheet(true); }}
                className="p-2 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
                aria-label="Display Settings"
              >
                <Settings2 className="w-5 h-5" />
              </button>
            </div>

            {/* Auth */}
            <div className="flex items-center gap-2">
              {user ? (
                <div className="relative">
                  <button 
                    onClick={(e) => { e.stopPropagation(); setShowUserMenu(!showUserMenu); }}
                    className="flex items-center gap-2 bg-slate-50 dark:bg-slate-800 pl-1 pr-2 py-1 rounded-full border border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 transition-colors"
                  >
                    <img src={user.photoURL || ''} alt="" className="w-7 h-7 sm:w-8 sm:h-8 rounded-full border border-white dark:border-slate-700 shadow-sm" />
                    <span className="hidden sm:block text-[10px] font-black text-slate-600 dark:text-slate-400 uppercase tracking-tighter truncate max-w-[60px]">{user.displayName?.split(' ')[0]}</span>
                  </button>
                  
                  <AnimatePresence>
                    {showUserMenu && (
                      <motion.div 
                        initial={{ opacity: 0, y: 10, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 10, scale: 0.95 }}
                        className="absolute right-0 mt-2 w-48 bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-100 dark:border-slate-800 z-50 overflow-hidden py-1"
                      >
                        <div className="px-4 py-3 border-b border-slate-50 dark:border-slate-800 mb-1">
                          <p className="text-[10px] font-black text-slate-400 dark:text-slate-600 uppercase tracking-widest leading-none mb-1">Signed in as</p>
                          <p className="text-xs font-bold text-slate-900 dark:text-white truncate">{user.email}</p>
                        </div>
                        <button 
                          onClick={() => signOut(auth)}
                          className="w-full flex items-center gap-3 px-4 py-3 text-xs font-bold text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors"
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
                  className="px-5 py-2 bg-emerald-600 text-white rounded-full text-[10px] font-black uppercase tracking-widest hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-100"
                >
                  Login
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
              className="fixed top-0 left-0 bottom-0 z-[70] w-[280px] bg-white dark:bg-slate-900 shadow-2xl flex flex-col"
              onClick={e => e.stopPropagation()}
            >
              <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                <div className="flex flex-col">
                  <h3 className="font-black text-slate-900 dark:text-white tracking-tight">Ya Hakeem</h3>
                  <p className="text-[10px] font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-widest mt-0.5">Risale-i Nur</p>
                </div>
                <button onClick={() => setShowMobileMenu(false)} className="p-2 bg-slate-50 dark:bg-slate-800 rounded-full text-slate-400 dark:text-slate-500 hover:text-slate-900 dark:hover:text-white transition-colors">
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
                />
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Sidebar - Collapsible on Desktop */}
      <aside 
        className={`fixed top-14 left-0 bottom-0 z-40 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 transition-all duration-300 ease-in-out hidden lg:block
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
            <h2 className="text-3xl font-black text-slate-900 tracking-tight leading-tight">
              {activeItem?.title}
              {activeItem?.detail && (
                <span className="block sm:inline sm:ml-4 text-lg font-medium text-slate-400 italic font-serif opacity-70">
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
                    transition={{ delay: (sIdx % entriesPerPage) * 0.05 }}
                    className="group relative bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 overflow-hidden hover:shadow-2xl hover:border-emerald-100 dark:hover:border-emerald-900/50 transition-all duration-300"
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
                                      ${isLinked ? 'bg-emerald-50 dark:bg-emerald-900/40 ring-1 ring-emerald-200 dark:ring-emerald-800 text-emerald-900 dark:text-emerald-300 font-bold' : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800'}
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

                              {user?.uid === sentence.authorId && (
                                <>
                                  <div className="mx-3 my-1 border-t border-slate-50 dark:border-slate-800" />
                                  <button 
                                    onClick={(e) => { e.stopPropagation(); setEditingEntry(sentence); setShowCMS(true); setActiveMenu(null); }}
                                    className="w-full flex items-center gap-3 px-4 py-3 text-[10px] font-black text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-colors uppercase tracking-widest text-left"
                                  >
                                    <Edit3 className="w-4 h-4" />
                                    Edit Entry
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
              className="fixed inset-0 z-[80] bg-slate-950/40 backdrop-blur-sm sm:hidden"
            />
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              className="fixed bottom-0 left-0 right-0 z-[90] bg-white dark:bg-slate-900 rounded-t-[32px] p-6 pb-12 sm:hidden overflow-hidden"
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
                        className="w-full flex items-center gap-4 p-5 rounded-2xl bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-black uppercase text-[10px] tracking-widest"
                      >
                        <Copy className="w-5 h-5" /> Copy Text
                      </button>
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          handleShare(sentence);
                          setActiveMenu(null);
                        }}
                        className="w-full flex items-center gap-4 p-5 rounded-2xl bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-black uppercase text-[10px] tracking-widest"
                      >
                        <Share2 className="w-5 h-5" /> Share
                      </button>
                      <button 
                        onClick={(e) => { e.stopPropagation(); setFeedbackSentence(sentence); setShowFeedbackModal(true); setActiveMenu(null); }}
                        className="w-full flex items-center gap-4 p-5 rounded-2xl bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400 font-black uppercase text-[10px] tracking-widest"
                      >
                        <MessageSquare className="w-5 h-5" /> Feedback
                      </button>
                      {user?.uid === sentence.authorId && (
                        <>
                          <div className="py-2" />
                          <button 
                            onClick={() => { setEditingEntry(sentence); setShowCMS(true); setActiveMenu(null); }}
                            className="w-full flex items-center gap-4 p-5 rounded-2xl bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 font-black uppercase text-[10px] tracking-widest"
                          >
                            <Edit3 className="w-5 h-5" /> Edit Entry
                          </button>
                          <button 
                            onClick={() => { if(confirm("Delete entry?")) deleteDoc(doc(db, 'sentences', activeMenu!)); setActiveMenu(null); }}
                            className="w-full flex items-center gap-4 p-5 rounded-2xl bg-rose-50 dark:bg-rose-900/30 text-rose-700 dark:text-rose-400 font-black uppercase text-[10px] tracking-widest"
                          >
                            <Trash2 className="w-5 h-5" /> Delete Permanently
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
              className="fixed inset-0 z-[60] bg-slate-950/20 backdrop-blur-sm lg:bg-transparent lg:backdrop-blur-none"
            />
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              onClick={e => e.stopPropagation()}
              className="fixed bottom-0 left-0 right-0 z-[70] p-4 lg:p-8 flex justify-center pointer-events-none"
            >
              <div className="w-full max-w-2xl bg-white dark:bg-slate-900 lg:bg-slate-900/95 lg:backdrop-blur-xl rounded-t-[2.5rem] lg:rounded-[2.5rem] shadow-2xl border border-slate-100 dark:border-slate-800 lg:border-white/10 pointer-events-auto overflow-hidden transition-colors">
                <div className="p-6 lg:p-8">
                  <div className="flex items-center justify-between mb-8">
                    <div className="flex items-center gap-3">
                      <div className="p-2.5 bg-indigo-50 dark:bg-indigo-900/30 lg:bg-white/10 rounded-xl">
                        <Link2 className="w-5 h-5 text-indigo-600 dark:text-indigo-400 lg:text-indigo-400" />
                      </div>
                      <div>
                        <h3 className="font-black text-slate-900 dark:text-white uppercase tracking-[0.2em] text-[10px]">Lexical Harmony</h3>
                        <p className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Cross-Linguistic Mapping</p>
                      </div>
                    </div>
                    <button 
                      onClick={() => setActiveHighlight(null)}
                      className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 lg:hover:bg-white/10 rounded-full transition-colors text-slate-300 dark:text-slate-600 lg:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 lg:hover:text-white"
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
                               ? 'bg-slate-50 lg:bg-white/5 border border-slate-100 lg:border-white/10 ring-2 ring-indigo-500/20' 
                               : 'bg-white lg:bg-transparent border border-transparent'
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
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showCMS && user && (
          <CMSModal 
            user={user}
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
              } catch (e) { handleFirestoreError(e, OperationType.CREATE, 'sentences'); }
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// --- Feedback Modal Component ---

function FeedbackModal({ sentence, metadata, onClose }: { sentence: Sentence, metadata: string, onClose: () => void }) {
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
      className="fixed inset-0 z-[1000] bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        onClick={e => e.stopPropagation()}
        className="w-full max-w-lg bg-white dark:bg-slate-900 rounded-[2.5rem] shadow-2xl overflow-hidden border border-slate-100 dark:border-slate-800"
      >
        <div className="p-8 pb-4">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-indigo-50 dark:bg-indigo-900/30 rounded-xl">
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
  initialData?: Sentence | null;
  onClose: () => void;
  onSave: (data: Omit<Sentence, 'id' | 'authorId' | 'createdAt' | 'bookId' | 'itemId'>) => Promise<void>;
}

function CMSModal({ user, initialData, onClose, onSave }: CMSModalProps) {
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
            <Edit3 className="w-5 h-5 text-emerald-500" />
            <h2 className="text-xl font-bold text-slate-800">{initialData ? 'Edit Sentence Pair' : 'Add New Parallel Entry'}</h2>
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
