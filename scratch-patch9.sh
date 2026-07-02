sed -i 's/<header className="flex items-center justify-between border-b border-border bg-card px-3 md:px-5 py-3 shadow-sm z-10">/<header className="flex items-center justify-between border-b border-border bg-card px-3 md:px-5 py-3 shadow-sm z-10 min-w-0 w-full">/' src/routes/_authenticated/conversations.tsx

sed -i 's/<ScrollArea className="flex-1 px-4 py-6 bg-muted\/10 relative">/<ScrollArea className="flex-1 px-4 py-6 bg-muted\/10 relative min-w-0 w-full">/' src/routes/_authenticated/conversations.tsx

sed -i 's/<div className={cn("p-3 bg-card border-t border-border shrink-0 z-10 transition-colors",/<div className={cn("p-3 bg-card border-t border-border shrink-0 z-10 transition-colors min-w-0 w-full",/' src/routes/_authenticated/conversations.tsx
