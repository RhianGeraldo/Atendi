sed -i 's/export function ContactDetailsTabs({ contactId }: { contactId: string }) {/export function ContactDetailsTabs({ contactId, conversationId }: { contactId: string; conversationId?: string }) {\n  const [activeTab, setActiveTab] = useState("jornada");\n\n  useEffect(() => {\n    const handleSwitch = (e: any) => {\n      if (e.detail) {\n        setActiveTab(e.detail);\n      }\n    };\n    window.addEventListener("open-contact-tab", handleSwitch);\n    return () => window.removeEventListener("open-contact-tab", handleSwitch);\n  }, []);/' src/components/contacts/contact-details-sheet.tsx

sed -i 's/<Tabs defaultValue="jornada"/<Tabs value={activeTab} onValueChange={setActiveTab}/' src/components/contacts/contact-details-sheet.tsx

sed -i 's/import { Loader2/import { SalesCoachTab } from "@\/components\/chat\/sales-coach-tab";\nimport { Loader2/' src/components/contacts/contact-details-sheet.tsx
