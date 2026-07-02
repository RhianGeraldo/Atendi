sed -i 's/<ScrollArea className="flex-1 w-full bg-muted\/10">/<div className="flex-1 w-full bg-muted\/10 overflow-y-auto overflow-x-hidden min-w-0">/' src/routes/_authenticated/conversations.tsx
sed -i 's/<\/ScrollArea>/<\/div>/' src/routes/_authenticated/conversations.tsx

sed -i 's/<ScrollArea className="flex-1 p-4">/<div className="flex-1 p-4 overflow-y-auto overflow-x-hidden min-w-0">/' src/components/contacts/contact-details-sheet.tsx
sed -i 's/<\/ScrollArea>/<\/div>/' src/components/contacts/contact-details-sheet.tsx
