'use client';
import { useMemo, useState } from 'react';
import { Avatar, Textarea } from '@/components/ui/ui';
import type { Profile } from '@/lib/types';

export default function MentionTextarea({
  value,
  onChange,
  people,
  mentionIds,
  onMentionIdsChange,
  rows = 2,
  placeholder,
  className,
  maxLength = 2000
}: {
  value: string;
  onChange: (value: string) => void;
  people: Profile[];
  mentionIds: string[];
  onMentionIdsChange: (ids: string[]) => void;
  rows?: number;
  placeholder: string;
  className?: string;
  maxLength?: number;
}) {
  const [query, setQuery] = useState<string | null>(null);
  const [selection, setSelection] = useState(0);
  const [activeIndex, setActiveIndex] = useState(0);
  const matches = useMemo(() => query === null ? [] : people
    .filter((person) => person.display_name.toLocaleLowerCase().includes(query.toLocaleLowerCase()))
    .slice(0, 6), [people, query]);

  function changeValue(next: string, cursor: number) {
    onChange(next);
    const beforeCursor = next.slice(0, cursor);
    const token = beforeCursor.match(/(?:^|\s)@([^\s@]*)$/);
    setQuery(token ? token[1] : null);
    setSelection(cursor);
    setActiveIndex(0);
    const validIds = mentionIds.filter((id) => {
      const person = people.find((item) => item.id === id);
      return person ? next.includes(`@${person.display_name}`) : false;
    });
    if (validIds.length !== mentionIds.length) onMentionIdsChange(validIds);
  }

  function choose(person: Profile) {
    const before = value.slice(0, selection);
    const after = value.slice(selection);
    const token = before.match(/(?:^|\s)@([^\s@]*)$/);
    if (!token || !matches.some((item) => item.id === person.id)) return;
    const start = selection - token[0].length;
    const next = `${value.slice(0, start)}${start === 0 || /\s$/.test(value.slice(0, start)) ? '' : ' ' }@${person.display_name} ${after}`;
    onChange(next);
    onMentionIdsChange(mentionIds.includes(person.id) ? mentionIds : [...mentionIds, person.id]);
    setSelection(start + person.display_name.length + 2);
    setQuery(null);
  }

  return (
    <div className="relative">
      <Textarea
        dir="auto"
        rows={rows}
        maxLength={maxLength}
        value={value}
        placeholder={placeholder}
        onChange={(event) => changeValue(event.target.value, event.target.selectionStart)}
        onKeyDown={(event) => {
          if (query === null || matches.length === 0) return;
          if (event.key === 'ArrowDown') { event.preventDefault(); setActiveIndex((index) => (index + 1) % matches.length); }
          if (event.key === 'ArrowUp') { event.preventDefault(); setActiveIndex((index) => (index - 1 + matches.length) % matches.length); }
          if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); choose(matches[activeIndex % matches.length]); }
          if (event.key === 'Escape') setQuery(null);
        }}
        className={`resize-none ${className ?? ''}`}
      />
      {query !== null && matches.length > 0 && (
        <div className="absolute inset-x-0 bottom-full z-30 mb-2 overflow-hidden rounded-2xl border border-[#5b4631]/15 bg-[#fffdfa] p-1.5 shadow-xl">
          {matches.map((person, index) => (
            <button key={person.id} type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => choose(person)} className={`flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-right transition ${index === activeIndex % matches.length ? 'bg-coral/10' : 'hover:bg-coral/5'}`}>
              <Avatar name={person.display_name} url={person.avatar_url} size={28} />
              <span className="truncate text-sm font-semibold">{person.display_name}</span>
              <span className="ms-auto text-xs text-slate-500">@إشارة</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
