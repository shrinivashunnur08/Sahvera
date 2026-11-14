import React, { useState } from 'react';
import { Download, Smartphone } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

export const PWAInstallButton: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showGuide, setShowGuide] = useState(false);

  if (isInstalled) {
    return null;
  }

  if (isInstallable) {
    return (
      <button
        type="button"
        onClick={install}
        className="inline-flex min-h-[36px] items-center gap-1.5 rounded-md border border-[#0F4C4C]/30 bg-[#F0F5F4] px-3 py-1.5 text-xs font-semibold text-[#0F4C4C] hover:bg-[#E2ECEA] transition-colors whitespace-nowrap shrink-0"
      >
        <Download className="h-3.5 w-3.5" aria-hidden="true" />
        <span>Install App</span>
      </button>
    );
  }

  if (isIOS) {
    return (
      <>
        <button
          type="button"
          onClick={() => setShowGuide(true)}
          className="inline-flex min-h-[36px] items-center gap-1.5 rounded-md border border-[#DEDBD2] bg-white px-2.5 py-1.5 text-xs font-medium text-[#111C1B] hover:bg-[#F7F6F2] whitespace-nowrap shrink-0"
        >
          <Smartphone className="h-3.5 w-3.5 text-[#0F4C4C]" aria-hidden="true" />
          <span>Install</span>
        </button>

        {showGuide && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="w-full max-w-sm rounded-lg border border-[#DEDBD2] bg-white p-5 shadow-xl space-y-3">
              <h3 className="font-display text-base font-semibold text-[#111C1B]">
                Install Sahvera on iPhone / iPad
              </h3>
              <p className="text-xs text-[#4A5957] leading-relaxed">
                1. Tap the <strong>Share</strong> icon in the Safari toolbar.
                <br />
                2. Scroll down and tap <strong>Add to Home Screen</strong> to use Sahvera as a
                warden app with offline local parsing.
              </p>
              <button
                type="button"
                onClick={() => setShowGuide(false)}
                className="min-h-[38px] w-full rounded-md bg-[#0F4C4C] py-1.5 text-xs font-semibold text-white hover:bg-[#0A3838]"
              >
                Close
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
};
