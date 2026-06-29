import { useState, useEffect } from "react";
import { X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export function MobileBanner() {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // Show banner after 2s delay
    const timer = setTimeout(() => {
      setIsVisible(true);
    }, 2000);

    return () => clearTimeout(timer);
  }, []);

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 100, opacity: 0 }}
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
          className="fixed bottom-4 left-0 right-0 z-50 flex justify-center md:hidden pointer-events-none px-4"
        >
          <div className="relative w-full max-w-[320px] h-[50px] bg-card border border-primary/30 rounded shadow-[0_0_15px_rgba(0,229,255,0.2)] pointer-events-auto flex items-center justify-center">
            <span className="absolute -top-2 left-2 bg-background px-1 text-[8px] tracking-widest text-muted-foreground uppercase">
              Advertisement
            </span>
            
            <button 
              onClick={() => setIsVisible(false)}
              className="absolute -top-2 -right-2 bg-muted hover:bg-muted/80 text-muted-foreground hover:text-foreground rounded-full p-1 border border-border transition-colors"
            >
              <X className="w-3 h-3" />
            </button>
            
            {/* Replace with your Monetag zone script */}
            <div id="monetag-banner-zone" className="w-full h-full flex items-center justify-center text-xs text-muted-foreground/50 font-mono">
              [ Monetag Ad Zone ]
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
