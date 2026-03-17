import React, { createContext, useContext, useState, useEffect } from "react";

type Language = "en" | "ar";

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string) => string;
  dir: "ltr" | "rtl";
}

const translations: Record<Language, Record<string, string>> = {
  en: {
    "nav.dashboard": "Dashboard",
    "nav.signOut": "Sign Out",
    "nav.settings": "Settings",
    "theme.light": "Light",
    "theme.dark": "Dark",
    "lang.toggle": "العربية",
    "app.name": "QR Tally",
  },
  ar: {
    "nav.dashboard": "لوحة التحكم",
    "nav.signOut": "تسجيل الخروج",
    "nav.settings": "الإعدادات",
    "theme.light": "فاتح",
    "theme.dark": "داكن",
    "lang.toggle": "English",
    "app.name": "QR Tally",
  },
};

const LanguageContext = createContext<LanguageContextType>({
  language: "en",
  setLanguage: () => {},
  t: (key) => key,
  dir: "ltr",
});

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguage] = useState<Language>(
    () => (localStorage.getItem("qr-tally-lang") as Language) || "en"
  );

  const dir = language === "ar" ? "rtl" : "ltr";

  useEffect(() => {
    localStorage.setItem("qr-tally-lang", language);
    document.documentElement.dir = dir;
    document.documentElement.lang = language;
  }, [language, dir]);

  const t = (key: string) => translations[language][key] || key;

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t, dir }}>
      {children}
    </LanguageContext.Provider>
  );
}

export const useLanguage = () => useContext(LanguageContext);
