import { useState, useRef, useEffect } from 'react';
import { Dropdown, Button } from 'react-bootstrap';
import type { Language } from '../types';
import { t } from '../i18n/strings';

const LANGS: { code: Language; native: string }[] = [
  { code: 'en', native: 'English' },
  { code: 'ar', native: 'العربية' },
  { code: 'hi', native: 'हिन्दी' },
];

export function LanguageSelector({
  lang,
  onChange,
}: {
  lang: Language;
  onChange: (l: Language) => void;
}) {
  const s = t(lang);
  const current = LANGS.find((l) => l.code === lang)!;
  return (
    <Dropdown align="end" className="aira-glass">
      <Dropdown.Toggle variant="light" size="sm" className="d-flex align-items-center gap-1 rounded-pill aira-glass">
        <i className="bi bi-globe" /> {current.native}
      </Dropdown.Toggle>
      <Dropdown.Menu className="aira-glass">
        {LANGS.map((l) => (
          <Dropdown.Item
            key={l.code}
            active={l.code === lang}
            onClick={() => onChange(l.code)}
            style={l.code === lang ? { backgroundColor: '#1A83B1', color: '#ffffff' } : undefined}
          >
            {l.native}
            {l.code === lang && <i className="bi bi-check-lg ms-2" />}
          </Dropdown.Item>
        ))}
      </Dropdown.Menu>
    </Dropdown>
  );
}
