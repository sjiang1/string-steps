"use client";

import {
  createContext,
  useCallback,
  useContext,
  useState,
} from "react";

interface ServerActivityValue {
  count: number;
  increment: () => void;
  decrement: () => void;
}

const ServerActivityContext = createContext<ServerActivityValue | null>(null);

export function ServerActivityProvider({ children }: { children: React.ReactNode }) {
  const [count, setCount] = useState(0);
  const increment = useCallback(() => setCount((c) => c + 1), []);
  const decrement = useCallback(() => setCount((c) => Math.max(0, c - 1)), []);

  return (
    <ServerActivityContext.Provider value={{ count, increment, decrement }}>
      {children}
      <TopProgressBar />
    </ServerActivityContext.Provider>
  );
}

export function useTrackedAction() {
  const ctx = useContext(ServerActivityContext);
  const increment = ctx?.increment;
  const decrement = ctx?.decrement;
  return useCallback(
    async <T,>(promise: Promise<T>): Promise<T> => {
      if (!increment || !decrement) return promise;
      increment();
      try {
        return await promise;
      } finally {
        decrement();
      }
    },
    [increment, decrement],
  );
}

function TopProgressBar() {
  const ctx = useContext(ServerActivityContext);
  const active = (ctx?.count ?? 0) > 0;
  const visibility = active ? "opacity-100 delay-200" : "opacity-0 delay-0";
  return (
    <div
      role="progressbar"
      aria-label="Loading"
      aria-hidden={!active}
      className={`fixed top-0 left-0 right-0 z-[60] h-1 overflow-hidden bg-transparent pointer-events-none transition-opacity duration-75 ${visibility}`}
    >
      <div className="h-full w-1/3 bg-sky-500 animate-[progress-slide_1.2s_ease-in-out_infinite]" />
    </div>
  );
}
