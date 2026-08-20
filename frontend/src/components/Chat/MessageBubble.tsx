import React, { useState } from 'react';
import type { Message } from '../../types';
import { AlertCircle, CheckCircle2, ChevronDown, ChevronUp, Volume2 } from 'lucide-react';
import { clsx } from 'clsx';

interface Props {
  message: Message;
  onSpeak?: (text: string) => void;
  showFeedback?: boolean;
}

export const MessageBubble: React.FC<Props> = ({ message, onSpeak, showFeedback = true }) => {
  const [showCorrected, setShowCorrected] = useState(false);
  const isUser = message.role === 'user';

  const formatContent = (text: string) => {
    return text
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\n/g, '<br/>');
  };

  return (
    <div className={clsx('flex', isUser ? 'justify-end' : 'justify-start')}>
      <div className={clsx('max-w-[80%] space-y-2')}>
        {/* Avatar label */}
        <div className={clsx(
          'text-xs text-slate-400 mb-1',
          isUser ? 'text-right' : 'text-left'
        )}>
          {isUser ? 'You' : 'Claude'}
        </div>

        {/* Main bubble */}
        <div className={clsx(
          'rounded-2xl px-4 py-3 text-sm leading-relaxed',
          isUser
            ? 'bg-blue-600 text-white rounded-tr-sm'
            : 'bg-slate-700 text-slate-100 rounded-tl-sm'
        )}>
          <div dangerouslySetInnerHTML={{ __html: formatContent(message.content) }} />
          {!isUser && onSpeak && (
            <div className="mt-3 flex justify-end">
              <button
                type="button"
                onClick={() => onSpeak(message.content)}
                title="Read answer aloud"
                className="rounded-lg p-1.5 text-slate-300 transition-colors hover:bg-slate-600 hover:text-white"
              >
                <Volume2 size={15} />
              </button>
            </div>
          )}
        </div>

        {/* Error indicator + corrected version */}
        {showFeedback && isUser && message.has_errors && message.corrected_content && (
          <div className="bg-amber-900/40 border border-amber-700/50 rounded-xl overflow-hidden">
            <button
              onClick={() => setShowCorrected(prev => !prev)}
              className="w-full flex items-center justify-between px-3 py-2 text-xs text-amber-400 hover:bg-amber-900/30 transition-colors"
            >
              <span className="flex items-center gap-1.5">
                <AlertCircle size={13} />
                Show corrected version
              </span>
              {showCorrected ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            </button>
            {showCorrected && (
              <div className="px-3 pb-3 text-xs text-amber-200 border-t border-amber-700/30 pt-2 leading-relaxed">
                {message.corrected_content}
              </div>
            )}
          </div>
        )}

        {/* No errors badge */}
        {showFeedback && isUser && message.has_errors === false && (
          <div className="flex items-center justify-end gap-1 text-xs text-green-400">
            <CheckCircle2 size={12} />
            <span>No mistakes</span>
          </div>
        )}
      </div>
    </div>
  );
};
