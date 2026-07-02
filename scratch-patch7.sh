sed -i 's/<div className="space-y-6">/<div className="space-y-6 min-w-0 w-full">/' src/components/chat/sales-coach-tab.tsx

sed -i 's/prose prose-sm/prose prose-sm w-full min-w-0 overflow-x-auto/' src/components/chat/sales-coach-tab.tsx

sed -i 's/<TabsContent value="sales_coach" className="mt-0 h-full">/<TabsContent value="sales_coach" className="mt-0 h-full min-w-0 w-full overflow-hidden">/' src/components/contacts/contact-details-sheet.tsx
