sed -i '/const \[text, setText\] = useState("");/a\
  useEffect(() => {\
    const handleInsert = (e: any) => {\
      if (e.detail) {\
        setText(prev => prev + (prev.endsWith(" ") || prev === "" ? "" : " ") + e.detail);\
        setTimeout(() => {\
          document.getElementById("chat-input")?.focus();\
        }, 100);\
      }\
    };\
    window.addEventListener("insert-chat-text", handleInsert);\
    return () => window.removeEventListener("insert-chat-text", handleInsert);\
  }, []);' src/routes/_authenticated/conversations.tsx
