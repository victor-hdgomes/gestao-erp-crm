"use client";

import { forwardRef } from "react";

import { Input } from "@/components/ui/input";

type MaskedInputProps = {
  value: string;
  onValueChange: (digitsOnly: string) => void;
  id?: string;
  name?: string;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
};

function maskCpf(digits: string): string {
  return digits
    .slice(0, 11)
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d{1,2})$/, ".$1-$2");
}

function maskPhone(digits: string): string {
  const value = digits.slice(0, 11);
  if (value.length <= 10) {
    return value.replace(/(\d{2})(\d{1,4})(\d{0,4})/, (_, a, b, c) =>
      c ? `(${a}) ${b}-${c}` : b ? `(${a}) ${b}` : `(${a}`,
    );
  }
  return value.replace(/(\d{2})(\d{5})(\d{0,4})/, (_, a, b, c) =>
    c ? `(${a}) ${b}-${c}` : `(${a}) ${b}`,
  );
}

function maskZip(digits: string): string {
  return digits.slice(0, 8).replace(/(\d{5})(\d{1,3})/, "$1-$2");
}

const MASKS = { cpf: maskCpf, phone: maskPhone, zip: maskZip } as const;

export const MaskedInput = forwardRef<HTMLInputElement, MaskedInputProps & { mask: keyof typeof MASKS }>(
  function MaskedInput({ mask, value, onValueChange, ...props }, ref) {
    const apply = MASKS[mask];
    return (
      <Input
        {...props}
        ref={ref}
        inputMode="numeric"
        value={apply(value ?? "")}
        onChange={(event) => onValueChange(event.target.value.replace(/\D/g, ""))}
      />
    );
  },
);
