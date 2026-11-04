"use client";

import { forwardRef, useEffect, useState } from "react";

import { Input } from "@/components/ui/input";

type CurrencyInputProps = {
  value: string;
  onValueChange: (value: string) => void;
  id?: string;
  name?: string;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
};

const BRL = new Intl.NumberFormat("pt-BR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function digitsToDisplay(digits: string): string {
  const cents = Number(digits || "0");
  return BRL.format(cents / 100);
}

function decimalToDigits(decimal: string): string {
  const numeric = Number(decimal || "0");
  if (!Number.isFinite(numeric)) return "";
  return String(Math.round(numeric * 100));
}

/**
 * Types like a bank app: digits fill from the cents upwards. The value handed to
 * the form is always a plain decimal string such as "1400.00".
 */
export const CurrencyInput = forwardRef<HTMLInputElement, CurrencyInputProps>(
  function CurrencyInput({ value, onValueChange, ...props }, ref) {
    const [digits, setDigits] = useState(() => decimalToDigits(value));

    useEffect(() => {
      const next = decimalToDigits(value);
      setDigits((current) => (current === next ? current : next));
    }, [value]);

    return (
      <Input
        {...props}
        ref={ref}
        inputMode="numeric"
        value={digitsToDisplay(digits)}
        onChange={(event) => {
          const nextDigits = event.target.value.replace(/\D/g, "").slice(0, 12);
          setDigits(nextDigits);
          onValueChange((Number(nextDigits || "0") / 100).toFixed(2));
        }}
      />
    );
  },
);
