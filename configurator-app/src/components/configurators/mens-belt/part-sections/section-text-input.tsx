import { memo } from 'react';

interface SectionTextInputProps {
  title: string;
  value: string;
  placeholder?: string;
  maxLength?: number;
  onChange: (value: string) => void;
}

export const SectionTextInput = memo(
  ({
    title,
    value,
    placeholder,
    maxLength = 24,
    onChange,
  }: SectionTextInputProps) => (
    <section className="border-border border-b px-3 py-3">
      <div className="mb-2 flex items-baseline gap-2 max-lg:hidden">
        <h3 className="text-foreground text-[12px] font-semibold tracking-wide uppercase">
          {title}
        </h3>
        <span className="text-muted-foreground">|</span>
        <span className="text-muted-foreground truncate text-[10px] font-medium tracking-wide uppercase">
          {value.trim() || 'None'}
        </span>
      </div>
      <input
        value={value}
        maxLength={maxLength}
        onChange={(e) => onChange(e.target.value.toUpperCase())}
        placeholder={placeholder}
        className="border-border bg-background text-foreground placeholder:text-muted-foreground focus:border-foreground h-8 w-full rounded border px-2 text-xs transition-colors"
      />
      <div className="text-muted-foreground mt-2 text-right text-[10px]">
        {value.length}/{maxLength}
      </div>
    </section>
  ),
);

SectionTextInput.displayName = 'SectionTextInput';
