'use client';

import { useState, useRef, useEffect } from 'react';
import { usePdfStore } from '@/stores/pdf-store';
import { MarkdownMessage } from '@/components/chat/markdown-message';
import { SendHorizontal, Loader2, Sparkles, FileText } from 'lucide-react';

export function PdfChatPanel() {
    const {
        activeSession,
        activeSessionId,
        isChatLoading,
        sendMessage,
    } = usePdfStore();

    const [input, setInput] = useState('');
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLTextAreaElement>(null);

    // Auto-scroll on new messages
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [activeSession?.messages]);

    const handleSend = () => {
        if (!input.trim() || isChatLoading || !activeSessionId) return;
        sendMessage(input.trim());
        setInput('');
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    // No session selected — empty state
    if (!activeSession) {
        return (
            <div className="flex flex-col items-center justify-center h-full bg-gray-50">
                <div className="text-center max-w-md px-6">
                    <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-100 to-indigo-100 flex items-center justify-center mx-auto mb-4">
                        <Sparkles className="h-8 w-8 text-violet-500" />
                    </div>
                    <h2 className="text-xl font-semibold text-gray-800 mb-2">PDF AI Assistant</h2>
                    <p className="text-sm text-gray-500 leading-relaxed">
                        Upload a PDF from the sidebar to start. You can ask questions, summarize content,
                        rewrite paragraphs, fix grammar, and more.
                    </p>
                    <div className="mt-6 grid grid-cols-2 gap-2 text-xs text-gray-400">
                        <div className="flex items-center gap-1.5 bg-white rounded-lg p-2.5 border">
                            <FileText className="h-3.5 w-3.5" />
                            &quot;Summarize page 2&quot;
                        </div>
                        <div className="flex items-center gap-1.5 bg-white rounded-lg p-2.5 border">
                            <FileText className="h-3.5 w-3.5" />
                            &quot;Fix the grammar&quot;
                        </div>
                        <div className="flex items-center gap-1.5 bg-white rounded-lg p-2.5 border">
                            <FileText className="h-3.5 w-3.5" />
                            &quot;Shorten this section&quot;
                        </div>
                        <div className="flex items-center gap-1.5 bg-white rounded-lg p-2.5 border">
                            <FileText className="h-3.5 w-3.5" />
                            &quot;Rewrite paragraph 3&quot;
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full bg-gray-50">
            {/* Header */}
            <div className="flex items-center gap-2 px-4 py-3 border-b bg-white/80 backdrop-blur-sm">
                <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <h3 className="text-sm font-medium text-gray-700 truncate">
                    {activeSession.name}
                </h3>
                <span className="text-xs text-gray-400 ml-auto">
                    {activeSession.messages.length} messages
                </span>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
                {activeSession.messages.length === 0 && (
                    <div className="text-center py-8">
                        <p className="text-sm text-gray-400">Send a message to start chatting about your PDF.</p>
                    </div>
                )}

                {activeSession.messages.map((msg) => (
                    <div
                        key={msg.id}
                        className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                    >
                        <div
                            className={`
                max-w-[85%] rounded-2xl px-4 py-2.5
                ${msg.role === 'user'
                                    ? 'bg-gradient-to-r from-violet-600 to-indigo-600 text-white rounded-br-md'
                                    : 'bg-white border border-gray-200 text-gray-800 rounded-bl-md shadow-sm'
                                }
              `}
                        >
                            {msg.role === 'assistant' ? (
                                <MarkdownMessage content={msg.content || '...'} />
                            ) : (
                                <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                            )}
                        </div>
                    </div>
                ))}

                {isChatLoading && (
                    <div className="flex justify-start">
                        <div className="flex items-center gap-2 bg-white border rounded-2xl rounded-bl-md px-4 py-3 shadow-sm">
                            <Loader2 className="h-4 w-4 animate-spin text-violet-500" />
                            <span className="text-xs text-gray-400">Thinking...</span>
                        </div>
                    </div>
                )}

                <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="border-t bg-white p-3">
                <div className="flex items-end gap-2 max-w-3xl mx-auto">
                    <div className="flex-1 relative">
                        <textarea
                            ref={inputRef}
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={handleKeyDown}
                            placeholder="Ask about your PDF..."
                            className="w-full resize-none rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 pr-12 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-400 transition-all min-h-[44px] max-h-[120px]"
                            rows={1}
                            disabled={isChatLoading}
                        />
                    </div>
                    <button
                        onClick={handleSend}
                        disabled={!input.trim() || isChatLoading}
                        className="flex items-center justify-center h-11 w-11 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 text-white hover:from-violet-500 hover:to-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-lg shadow-violet-900/20"
                    >
                        <SendHorizontal className="h-4 w-4" />
                    </button>
                </div>
            </div>
        </div>
    );
}
