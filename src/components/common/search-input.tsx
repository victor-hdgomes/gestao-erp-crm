"use client";

import { useEffect, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";

import { Input } from "@/components/ui/input";

/** Writes the term into the URL, so server components re-query on change. */
export function SearchInput({
  placeholder = "Buscar...",
  paramName = "search",
  className,
}: {
  placeholder?: string;
  paramName?: string;
  className?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [value, setValue] = useState(params.get(paramName) ?? "");
  const [, startTransition] = useTransition();

  useEffect(() => {
    const timer = setTimeout(() => {
      const search = new URLSearchParams(params.toString());
      if (value) search.set(paramName, value);
      else search.delete(paramName);
      search.delete("page");

      const next = `${pathname}?${search.toString()}`;
      startTransition(() => router.replace(next));
    }, 350);

    return () => clearTimeout(timer);
    // `params` changes on every navigation; the term is what should drive this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <div className={className}>
      <div className="relative">
        <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
        <Input
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder={placeholder}
          className="pl-8"
        />
      </div>
    </div>
  );
}
