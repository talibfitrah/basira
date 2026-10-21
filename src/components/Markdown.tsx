"use client";
import { memo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import { IconCopy, IconCheck, IconCode } from "./Icons";

function textOf(node: React.ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (node && typeof node === "object" && "props" in node) return textOf((node as { props: { children?: React.ReactNode } }).props.children);
  return "";
}

function CodeBlock({ className, children }: { className?: string; children?: React.ReactNode }) {
  const [copied, setCopied] = useState(false);
  const [preview, setPreview] = useState(false);
  const lang = /language-([\w-]+)/.exec(className || "")?.[1] || "";
  const code = textOf(children).replace(/\n$/, "");
  const canPreview = ["html", "svg", "xml"].includes(lang) && /<(html|body|div|svg|section|main|canvas)/i.test(code);
  return (
    <div className="my-3 rounded-xl overflow-hidden border border-[var(--color-line)] bg-[#0d1117]" dir="ltr">
      <div className="flex items-center justify-between px-3 py-1.5 text-xs text-[#8b949e] bg-[#161b22]">
        <span>{lang || "code"}</span>
        <div className="flex gap-3">
          {canPreview && (
            <button onClick={() => setPreview((v) => !v)} className="flex items-center gap-1 hover:text-white">
              <IconCode className="w-3.5 h-3.5" />{preview ? "الشيفرة" : "معاينة"}
            </button>
          )}
          <button onClick={() => { navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
            className="flex items-center gap-1 hover:text-white">
            {copied ? <IconCheck className="w-3.5 h-3.5" /> : <IconCopy className="w-3.5 h-3.5" />}{copied ? "نُسخ" : "نسخ"}
          </button>
        </div>
      </div>
      {preview ? (
        <iframe sandbox="allow-scripts" srcDoc={code} className="w-full h-96 bg-white" title="معاينة" />
      ) : (
        <pre className="p-3 overflow-x-auto text-sm leading-relaxed scroll-thin"><code className={className}>{children}</code></pre>
      )}
    </div>
  );
}

function Markdown({ text }: { text: string }) {
  return (
    <div className="prose-ar">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[[rehypeHighlight, { detect: false, ignoreMissing: true }]]}
        components={{
          pre: ({ children }) => <>{children}</>,
          code: ({ className, children, ...rest }) => {
            const isBlock = /language-/.test(className || "") || textOf(children).includes("\n");
            return isBlock ? <CodeBlock className={className}>{children}</CodeBlock> : <code className={className} {...rest}>{children}</code>;
          },
          a: ({ href, children }) => <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>,
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}

export default memo(Markdown);
