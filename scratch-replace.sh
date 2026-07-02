sed -i '2369,2423c\
                  {/* Left Side: Sales Coach */}\
                  {showCoach && (\
                    <>\
                      <button\
                        className="rounded-full p-2.5 text-amber-500 hover:text-amber-600 mb-0.5 shrink-0 transition-colors"\
                        title="Sales Coach (Analisar com IA)"\
                        onClick={() => setCoachSheetOpen(true)}\
                      >\
                        <Bot className="h-6 w-6" />\
                      </button>\
                      <SalesCoachSheet\
                        conversationId={conv.id}\
                        open={coachSheetOpen}\
                        onOpenChange={setCoachSheetOpen}\
                        onSuggestion={(suggestionText) => {\
                          setText(prev => prev + (prev.endsWith(" ") || prev === "" ? "" : " ") + suggestionText);\
                        }}\
                      />\
                    </>\
                  )}' src/routes/_authenticated/conversations.tsx
