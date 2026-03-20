import { create } from 'zustand';

const now = new Date();
const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

const STORAGE_KEY = 'selectedDate';

function getInitialDate(): string {
  try {
    const stored = sessionStorage.getItem(STORAGE_KEY);
    if (stored && /^\d{4}-\d{2}-\d{2}$/.test(stored)) return stored;
  } catch {}
  return today;
}

interface DateState {
  selectedDate: string;
  setSelectedDate: (date: string) => void;
}

export const useDateStore = create<DateState>((set) => ({
  selectedDate: getInitialDate(),
  setSelectedDate: (date) => {
    try { sessionStorage.setItem(STORAGE_KEY, date); } catch {}
    set({ selectedDate: date });
  },
}));
