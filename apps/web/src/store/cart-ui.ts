"use client";

// Drawer/sheet open state, kept separate from the cart data so the header cart
// button, the mobile bottom bar, and the cart panel (independent client islands
// with no shared React parent) can all toggle the same visibility.

import { create } from "zustand";

interface CartUiState {
  isOpen: boolean;
  open: () => void;
  close: () => void;
}

export const useCartUiStore = create<CartUiState>((set) => ({
  isOpen: false,
  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),
}));
