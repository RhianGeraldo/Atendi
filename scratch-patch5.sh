sed -i 's/const isDesktop = useMediaQuery("(min-width: 1024px)");/const isDesktop = useMediaQuery("(min-width: 768px)");/' src/routes/_authenticated/conversations.tsx

sed -i 's/<aside className="hidden w-\[320px\] shrink-0 flex-col border-l border-border bg-card lg:flex/<aside className="hidden w-[320px] shrink-0 flex-col border-l border-border bg-card md:flex/' src/routes/_authenticated/conversations.tsx

sed -i 's/<SheetContent className="w-full sm:w-\[400px\] p-0 flex flex-col lg:hidden">/<SheetContent className="w-full sm:w-[400px] p-0 flex flex-col md:hidden">/' src/routes/_authenticated/conversations.tsx
