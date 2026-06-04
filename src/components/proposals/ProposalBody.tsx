'use client';
import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Button } from '@/components/ui/button';
import { ChevronDown, ChevronUp } from 'lucide-react';

export function ProposalBody({ body }: { body: string | null }) {
  const [open, setOpen] = useState(false);
  if (!body) return null;
  const preview = body.length > 600 ? body.slice(0, 600) + '…' : body;

  return (
    <div className="space-y-3">
      <div className="prose prose-invert max-w-none text-sm prose-pre:overflow-x-auto prose-pre:rounded prose-pre:bg-secondary prose-pre:p-3 prose-headings:font-semibold prose-a:text-primary prose-img:rounded">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{open ? body : preview}</ReactMarkdown>
      </div>
      {body.length > 600 && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setOpen((v) => !v)}
          className="text-muted-foreground"
        >
          {open ? (
            <>
              <ChevronUp className="h-4 w-4" /> Collapse
            </>
          ) : (
            <>
              <ChevronDown className="h-4 w-4" /> Read full proposal
            </>
          )}
        </Button>
      )}
    </div>
  );
}
