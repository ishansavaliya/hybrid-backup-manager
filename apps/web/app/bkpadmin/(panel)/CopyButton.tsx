"use client";

import { useState, type ReactNode } from "react";
import { Check, Copy } from "lucide-react";
import { Button, type ButtonVariant } from "../ui/Button";

export function CopyButton({
  text,
  label = "Copy",
  variant = "secondary",
}: {
  text: string;
  label?: ReactNode;
  variant?: ButtonVariant;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      variant={variant}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch {
          setCopied(false);
        }
      }}
    >
      {copied ? (
        <Check size={16} aria-hidden="true" />
      ) : (
        <Copy size={16} aria-hidden="true" />
      )}
      {copied ? "Copied" : label}
    </Button>
  );
}
