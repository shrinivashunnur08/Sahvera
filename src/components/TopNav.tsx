import React from 'react';
import { PWAInstallButton } from './PWAInstallButton';

export type WorkspaceTab = 'today' | 'rooms' | 'demo' | 'settings' | 'economics' | 'evaluators';

interface TopNavProps {
  currentRoute: 'intro' | 'workspace';
  activeWorkspaceTab?: WorkspaceTab;
  isSignedIn: boolean;
  userEmail?: string | null;
  onNavigateIntro: () => void;
  onTryDemo: () => void;
  onOpenWorkspace: (tab?: WorkspaceTab) => void;
  onSignIn: () => void;
  onSignOut: () => void;
}

export const TopNav: React.FC<TopNavProps> = ({
  currentRoute,
  activeWorkspaceTab,
  isSignedIn,
  userEmail,
  onNavigateIntro,
  onTryDemo,
  onOpenWorkspace,
  onSignIn,
  onSignOut,
}) => {
  return (
    <header className="border-b border-[#DEDBD2] bg-white">
      <div className="mx-auto flex max-w-[1280px] items-center justify-between gap-6 px-4 py-3.5 sm:px-6">
        <a
          href="/"
          onClick={(e) => {
            e.preventDefault();
            onNavigateIntro();
          }}
          className="font-display text-lg font-bold tracking-tight text-[#0F4C4C] whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0F4C4C]"
        >
          Sahvera
        </a>

        <nav
          aria-label="Primary navigation"
          className="hidden md:flex items-center gap-6 text-sm font-medium text-[#4A5957]"
        >
          <a
            href="#overview"
            onClick={(e) => {
              e.preventDefault();
              onNavigateIntro();
            }}
            className={`hover:text-[#0F4C4C] transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0F4C4C] ${
              currentRoute === 'intro' ? 'text-[#0F4C4C] underline underline-offset-4' : ''
            }`}
          >
            Overview
          </a>
          <a
            href="#workspace"
            onClick={(e) => {
              e.preventDefault();
              onOpenWorkspace(isSignedIn ? 'today' : 'rooms');
            }}
            className={`hover:text-[#0F4C4C] transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0F4C4C] ${
              currentRoute === 'workspace' &&
              (activeWorkspaceTab === 'today' || activeWorkspaceTab === 'rooms')
                ? 'text-[#0F4C4C] underline underline-offset-4'
                : ''
            }`}
          >
            Workspace
          </a>
          <a
            href="#sandbox"
            onClick={(e) => {
              e.preventDefault();
              onTryDemo();
            }}
            className={`hover:text-[#0F4C4C] transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0F4C4C] ${
              currentRoute === 'workspace' && activeWorkspaceTab === 'demo'
                ? 'text-[#0F4C4C] underline underline-offset-4'
                : ''
            }`}
          >
            Interactive Sandbox
          </a>
          <a
            href="#evaluation"
            onClick={(e) => {
              e.preventDefault();
              onOpenWorkspace('evaluators');
            }}
            className={`hover:text-[#0F4C4C] transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0F4C4C] ${
              currentRoute === 'workspace' &&
              (activeWorkspaceTab === 'evaluators' || activeWorkspaceTab === 'economics')
                ? 'text-[#0F4C4C] underline underline-offset-4'
                : ''
            }`}
          >
            ROI &amp; AI Eval
          </a>
        </nav>

        <div className="flex items-center gap-2.5 shrink-0">
          <PWAInstallButton />
          {isSignedIn ? (
            <>
              {userEmail && (
                <span className="hidden sm:inline text-xs text-[#4A5957] max-w-[180px] truncate">
                  {userEmail}
                </span>
              )}
              {currentRoute === 'intro' ? (
                <button
                  type="button"
                  onClick={() => onOpenWorkspace('today')}
                  className="min-h-[40px] rounded-md bg-[#0F4C4C] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0A3838] transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0F4C4C]"
                >
                  Open Workspace
                </button>
              ) : (
                <button
                  type="button"
                  onClick={onSignOut}
                  className="min-h-[40px] rounded-md border border-[#DEDBD2] bg-white px-4 py-2 text-sm font-medium text-[#111C1B] hover:bg-[#F7F6F2] transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0F4C4C]"
                >
                  Sign out
                </button>
              )}
            </>
          ) : (
            <>
              {currentRoute === 'intro' && (
                <button
                  type="button"
                  onClick={onTryDemo}
                  className="hidden sm:inline-flex min-h-[40px] items-center rounded-md border border-[#DEDBD2] bg-white px-3.5 py-2 text-sm font-medium text-[#111C1B] hover:bg-[#F7F6F2] transition-colors whitespace-nowrap shrink-0"
                >
                  Try Sandbox
                </button>
              )}
              <button
                type="button"
                onClick={onSignIn}
                className="min-h-[40px] rounded-md bg-[#0F4C4C] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0A3838] transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0F4C4C]"
              >
                Sign in with Google
              </button>
            </>
          )}
        </div>
      </div>
    </header>
  );
};
