"use client";

import { useEffect } from "react";

// Opens the browser's print dialog as soon as the printable page is on screen.
export default function AutoPrint() {
  useEffect(() => {
    window.print();
  }, []);
  return null;
}
