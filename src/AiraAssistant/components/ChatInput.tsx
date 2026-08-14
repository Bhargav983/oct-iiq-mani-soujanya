import { useState, useEffect, useRef } from 'react';
import { Button, Form, InputGroup, Dropdown } from 'react-bootstrap';
import type { Language, SuggestedAction, Machine } from '../types';
import { t } from '../i18n/strings';
import { QuickReplyBar } from './QuickReplyBar';
import { useInlineDictation } from '../hooks/useInlineDictation';
import { getMachines } from '../services/machineService';
import { match } from 'assert/strict';

const LANGS: { code: Language; native: string }[] = [
  { code: 'en', native: 'English' },
  { code: 'ar', native: 'العربية' },
  { code: 'hi', native: 'हिन्दी' },
];

export function ChatInput({
  lang,
  disabled,
  voiceSupported,
  suggestedActions,
  onSend,
  onQuickReply,
  onVoice,
  onLangChange,
}: {
  lang: Language;
  disabled: boolean;
  voiceSupported: boolean;
  suggestedActions: SuggestedAction[];
  onSend: (text: string) => void;
  onQuickReply: (action: SuggestedAction) => void;
  onVoice: () => void;
  onLangChange: (l: Language) => void;
}) {
  const s = t(lang);
  const [text, setText] = useState('');
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionIndex, setMentionIndex] = useState(-1);
  const [showMentionPopover, setShowMentionPopover] = useState(false);
  const isRtl = lang === 'ar';
  const dictation = useInlineDictation(lang, (spokenText) => {
    setText((current) => `${current}${current.trim() ? ' ' : ''}${spokenText}`);
  });

  const mentionItems = getMachines()
    .filter(machine => {
      const query = mentionQuery.toLowerCase();
      return query === '' || 
        machine.service_item_name.toLowerCase().includes(query) ||
        machine.location.toLowerCase().includes(query) ||
        machine.pcb_serial_number.toLowerCase().includes(query);
    })
    .slice(0, 10);

  const selectMention = (machine: Machine) => {
    const before = text.substring(0, mentionIndex);
    const after = text.substring(mentionIndex + 1 + mentionQuery.length).trim();
    const cleanAfter = after.startsWith(' ') ? after : ` ${after}`;
    const newText = `${before}@${machine.service_item_name} ${after}`.trim();
    
    setShowMentionPopover(false);
    setMentionQuery('');
    setMentionIndex(-1);
    setText(newText);
    
    // Focus the textarea after selection
    setTimeout(() => {
      const textarea = document.querySelector('.aira-composer textarea') as HTMLTextAreaElement;
      if (textarea) {
        textarea.focus();
        const targetPos = before.length + 1 + machine.service_item_name.length + 1;
        textarea.setSelectionRange(targetPos, targetPos);
      }
    }, 10);
  };

  const submit = () => {
    const v = text.trim();
    if (!v || disabled) return;
    onSend(v);
    setText('');
  };

  // Handle mention detection and popover
  useEffect(() => {
    const textarea = document.querySelector('.aira-composer textarea') as HTMLTextAreaElement | null;
    const cursor = textarea?.selectionStart ?? text.length;
    const textUpToCursor = text.slice(0, cursor);
    const lastAtIndex = textUpToCursor.lastIndexOf('@');
    if (lastAtIndex >= 0) {
      const query = textUpToCursor.slice(lastAtIndex + 1);
      const allMachines = getMachines();
      const isExactMachineName = allMachines.some(
        (m) => query === m.service_item_name || query === `${m.service_item_name} ` || query.startsWith(`${m.service_item_name} `)
      );
      if (isExactMachineName) {
        setShowMentionPopover(false);
        return;
      }
      const match = query.match(/^([\w\s()-]*)$/);

      if (match) {
        setMentionQuery(match[1]);
        setMentionIndex(lastAtIndex);
        setShowMentionPopover(true);
      } else {
        setShowMentionPopover(false);
      }
    } else {
      setShowMentionPopover(false);
    }
  }, [text]);

  // Handle keyboard navigation for mention popover
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!showMentionPopover) return;
    
    switch (e.key) {
      case 'ArrowUp':
      case 'ArrowDown':
        e.preventDefault();
        break;
      case 'Enter':
      case 'Tab':
        e.preventDefault();
        if (mentionItems.length > 0) {
          selectMention(mentionItems[0]);
        }
        break;
      case 'Escape':
        e.preventDefault();
        setShowMentionPopover(false);
        break;
    }
  };

  return (
    <div className="aira-composer" style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))', flexShrink: 0 }}>
      <div className="mx-auto d-flex flex-column" style={{ maxWidth: '42rem' }} dir={isRtl ? 'rtl' : 'ltr'}>
        <QuickReplyBar actions={suggestedActions} disabled={disabled} onSelect={onQuickReply} />
        <div className="aira-input-box-wrapper position-relative p-3">
          {/* Mention popover */}
          {showMentionPopover && mentionItems.length > 0 && (
            <div className="position-relative">
              <div className="aira-mention-popover">
                {mentionQuery && (
                  <div className="aira-mention-header">Machines matching "{mentionQuery}"</div>
                )}
                {mentionItems.map((machine, index) => (
                  <button
                    key={machine.id}
                    type="button"
                    className={`aira-mention-item ${index === 0 ? 'active' : ''}`}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                    onTouchStart={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      selectMention(machine);
                    }}
                  >
                    <div className="d-flex align-items-center">
                      <div className="me-2">
                        {machine.is_online ? (
                          <i className="bi bi-circle-fill text-success" style={{ fontSize: '0.75rem' }}></i>
                        ) : (
                          <i className="bi bi-circle text-muted" style={{ fontSize: '0.75rem' }}></i>
                        )}
                      </div>
                      <div className="flex-grow-1">
                        <div className="fw-medium">{machine.service_item_name}</div>
                        <div className="text-muted small">
                          Service ID: {machine.service_item_id || machine.id}
                        </div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
          <InputGroup>
            <Button
              className={isRtl ? 'rounded-end-pill d-flex align-items-center justify-content-center' : 'rounded-start-pill d-flex align-items-center justify-content-center'}
              style={{
                width: 48,
                backgroundColor: dictation.supported ? '#1A83B1' : 'rgba(26, 131, 177, 0.08)',
                borderColor: dictation.supported ? '#1A83B1' : 'rgba(26, 131, 177, 0.2)',
                color: dictation.supported ? '#ffffff' : '#1A83B1',
              }}
              onClick={dictation.listening ? dictation.stop : dictation.start}
              disabled={disabled || !dictation.supported}
              aria-label={dictation.listening ? 'Stop dictation' : 'Dictate message'}
              aria-pressed={dictation.listening}
            >
              <i className={dictation.listening ? 'bi bi-stop-fill' : 'bi bi-mic-fill'} />
            </Button>
            <Dropdown align={isRtl ? 'end' : 'start'} className="aira-voice-dropdown">
              <Dropdown.Toggle
                variant="light"
                aria-label="Select language"
                className={isRtl ? 'd-flex align-items-center gap-1 rounded-0 border-end-0' : 'd-flex align-items-center gap-1 rounded-0 border-start-0 aira-glass'}
                style={{ width: 48, justifyContent: 'center', borderLeft: 'none' }}
                id="lang-dropdown"
              >
                <i className="bi bi-globe" style={{ color: '#1A83B1' }} />
              </Dropdown.Toggle>
              <Dropdown.Menu className="aira-glass">
                {LANGS.map((l) => (
                  <Dropdown.Item
                    key={l.code}
                    active={l.code === lang}
                    onClick={() => onLangChange(l.code)}
                    style={l.code === lang ? { backgroundColor: '#1A83B1', color: '#ffffff' } : undefined}
                  >
                    {l.native}
                    {l.code === lang && <i className="bi bi-check-lg ms-2" style={{ color: '#1A83B1' }} />}
                  </Dropdown.Item>
                ))}
              </Dropdown.Menu>
            </Dropdown>
            <Form.Control
              as="textarea"
              rows={1}
              value={text}
              placeholder={s.askPlaceholder}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e: any) => {
                handleKeyDown(e);
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  submit();
                }
              }}
              style={{ resize: 'none', maxHeight: '7rem', borderRadius: 0 }}
            />
            <Button
              variant="primary"
              onClick={submit}
              disabled={disabled || !text.trim()}
              aria-label={s.send}
              style={{ width: 48, borderRadius: isRtl ? '50% 0 0 50%' : '0 50% 50% 0', backgroundColor: '#1A83B1', borderColor: '#1A83B1', color: '#ffffff' }}
            >
              <i className="bi bi-send-fill" />
            </Button>
          </InputGroup>
          <div className="d-flex align-items-center justify-content-between px-2 pt-2 small">
            <span className="text-muted text-truncate">{dictation.listening ? (dictation.interimText || 'Listening...') : dictation.errorMessage}</span>
            <button
              type="button"
              className="aira-voice-mode-trigger"
              onClick={onVoice}
              disabled={disabled || !voiceSupported}
              aria-label={s.askByVoice}
            >
              <i className="bi bi-soundwave me-1" /> Voice mode
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
