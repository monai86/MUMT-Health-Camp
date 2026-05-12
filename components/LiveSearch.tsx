"use client";

import { startTransition, useEffect, useState } from "react";
import Link from "next/link";
import { Search, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

type LiveSearchProps = {
  projectId: string;
  initialQuery: string;
};

export function LiveSearch({ projectId, initialQuery }: LiveSearchProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [value, setValue] = useState(initialQuery);

  useEffect(() => {
    setValue(initialQuery);
  }, [initialQuery]);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("projectId", projectId);
      params.set("page", "1");

      const next = value.trim();
      if (next) {
        params.set("q", next);
      } else {
        params.delete("q");
      }

      startTransition(() => {
        router.replace(`${pathname}?${params.toString()}`, { scroll: false });
      });
    }, 250);

    return () => window.clearTimeout(handle);
  }, [pathname, projectId, router, searchParams, value]);

  return (
    <div className="live-search">
      <Search size={18} />
      <input
        aria-label="ค้นหาข้อมูลในตารางนี้"
        name="q"
        placeholder="ค้นหาข้อมูลในตารางนี้"
        value={value}
        onChange={(event) => setValue(event.target.value)}
      />
      {value ? (
        <Link aria-label="ล้างคำค้น" className="clear-search" href={`/dashboard?projectId=${projectId}`} scroll={false}>
          <X size={16} />
        </Link>
      ) : null}
    </div>
  );
}
