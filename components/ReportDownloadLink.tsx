"use client";

import { useState } from "react";
import { FileText } from "lucide-react";

export function ReportDownloadLink({
  href,
  label,
  className = "button",
  iconSize = 16,
  title
}: {
  href: string;
  label: string;
  className?: string;
  iconSize?: number;
  title?: string;
}) {
  const [pending, setPending] = useState(false);

  return (
    <a
      className={`${className}${pending ? " is-loading" : ""}`}
      href={href}
      title={title}
      aria-busy={pending}
      onClick={() => {
        setPending(true);
        window.setTimeout(() => setPending(false), 8000);
      }}
    >
      <FileText size={iconSize} />
      {pending ? "กำลังสร้าง..." : label}
    </a>
  );
}
