import { useState } from "react";
import { ContactDetailsSheet } from "@/components/contacts/contact-details-sheet";
import { cn } from "@/lib/utils";

/** Nome da cliente que indicou; com contato vinculado, abre a ficha dela. */
export function TodooReferrerLink({
  name,
  contactId,
  className,
}: {
  name: string;
  contactId?: string | null;
  className?: string;
}) {
  const [open, setOpen] = useState(false);

  if (!contactId) return <span className={className}>{name}</span>;

  return (
    <>
      <button
        type="button"
        title="Abrir ficha da cliente que indicou"
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
        className={cn(
          "underline decoration-dotted underline-offset-2 hover:text-primary cursor-pointer",
          className,
        )}
      >
        {name}
      </button>
      {open && <ContactDetailsSheet contactId={contactId} open={open} onOpenChange={setOpen} />}
    </>
  );
}
