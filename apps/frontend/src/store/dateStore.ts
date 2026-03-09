import { create } from 'zustand';

const now = new Date();
const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

interface DateState {
  selectedDate: string;
  setSelectedDate: (date: string) => void;
}

export const useDateStore = create<DateState>((set) => ({
  selectedDate: today,
  setSelectedDate: (date) => set({ selectedDate: date }),
}));
