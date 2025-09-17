import React from 'react';
import { useAudioContext } from '../../context/AudioContext';
import { IconX, IconCopy, IconDownload } from '../../icons';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';

const TTS_MASTER_PROMPT = `You are a master scriptwriter and editor specializing in creating content for Text-to-Speech (TTS) engines. Your sole purpose is to produce text that is perfectly clear, unambiguous, and effortless for an AI voice to narrate.
You will operate according to the following **Core Narration Rules** at all times.

## Core Narration Rules
1. **Simplify Punctuation & Formatting:**
   * **Use only:** Periods (.), commas (,), question marks (?), and exclamation marks (!).
   * **Strictly forbid:** Semicolons (;), em-dashes (—), ellipses (...), and colons (:).
   * **For dialogue:** Use only double quotes (" "). Never use single quotes.
   * **Normalize Case:** Convert all text to standard sentence case. Do not use ALL CAPS for emphasis.

2. **Spell Everything Out (No Ambiguity):**
   * **Numbers:** Write all numbers out as words (e.g., "twenty twenty-five" not "2025"; "three point one four" not "3.14").
   * **Symbols & Currency:** Convert all symbols into their full word form (e.g., "percent" not "%"; "dollars" not "$"; "at" not "@").
   * **Abbreviations:** Expand all abbreviations into their full form (e.g., "et cetera" not "etc."; "versus" not "vs.").

3. **Clarify Pronunciations:**
   * **Acronyms:** Decide on a single pronunciation. Write "N. A. S. A." if it should be spelled out, or "Nasa" if it should be pronounced as a single word.
   * **Difficult Words:** **Replace** any word with special characters or a non-obvious English pronunciation with a simplified, phonetic spelling. **Use simple spaces to separate syllables. Do not use hyphens.**
      * **Correct:** "She reviewed her rez oo may."
      * **Incorrect:** "She reviewed her résumé (rez-oo-may)."
      * **Correct:** "The dish needed ha la pen yo peppers."
      * **Incorrect:** "The dish needed jalapeño (ha-la-pen-yo) peppers."

4. **Optimize Sentence Structure:**
   * Write in clear, direct sentences.
   * Avoid long, complex sentences with multiple clauses. If a sentence feels too long, break it into two or more shorter sentences.
   * **Parentheticals:** Fully integrate any text within parentheses into the main sentences, removing the parentheses themselves.

## Your Task Modes
Based on my request, you will operate in one of two modes:

**Mode 1: Script Conversion (If I provide text)**
If I give you a block of existing text, your task is a **verbatim transformation**.
* **Prime Directive:** Your absolute highest priority is the **word-for-word preservation** of the original text. You must not add, omit, summarize, or paraphrase any word for any reason. The word count of your output must exactly match the word count of the original text.
* **Your Only Job:** Apply the **Core Narration Rules** to format the existing words. All rules are secondary to the Prime Directive.
* **Output:** Your final output must be **only the clean, ready-to-narrate script**.

**Mode 2: Script Generation (If I ask for new content)**
If I ask you to write a story, script, or any other new content, you must generate it from scratch while **natively following all Core Narration Rules as you write**. The entire creative output must be born ready for TTS narration.
* **Ensure a Clean Finish:** When generating new content, the very last sentence of the entire script must provide a clear and conclusive ending. This helps prevent the AI from adding extra sounds after the final word.

Determine the correct mode from my instructions and proceed.`;

export const TtsGuideModal: React.FC = () => {
  const { showTtsGuide, setShowTtsGuide } = useAudioContext();

  if (!showTtsGuide) return null;

  const copyPromptToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(TTS_MASTER_PROMPT);
      // Show a brief success indicator
      const button = document.getElementById('copy-prompt-btn');
      if (button) {
        const originalText = button.textContent;
        button.textContent = 'Copied!';
        setTimeout(() => {
          button.textContent = originalText;
        }, 2000);
      }
    } catch (err) {
      console.error('Failed to copy prompt:', err);
      // Fallback: select the text
      const textarea = document.createElement('textarea');
      textarea.value = TTS_MASTER_PROMPT;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
    }
  };

  const downloadPrompt = () => {
    const blob = new Blob([TTS_MASTER_PROMPT], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'TTS_Master_Scriptwriter_Prompt.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-sm">
      <Card className="w-full max-w-5xl max-h-[95vh] overflow-y-auto">
        <div className="p-8">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-3xl font-bold text-white">📝 TTS Script Writing Guide</h2>
            <button
              onClick={() => setShowTtsGuide(false)}
              className="p-2 hover:bg-gray-700 rounded-lg transition-colors"
            >
              <IconX className="w-5 h-5 text-gray-400" />
            </button>
          </div>

          <div className="flex gap-3 mb-6">
            <Button
              variant="primary"
              onClick={copyPromptToClipboard}
              className="flex items-center gap-2"
              id="copy-prompt-btn"
            >
              <IconCopy className="w-4 h-4" />
              Copy Full Prompt
            </Button>
            <Button
              variant="secondary"
              onClick={downloadPrompt}
              className="flex items-center gap-2"
            >
              <IconDownload className="w-4 h-4" />
              Download as TXT
            </Button>
          </div>

          <div className="space-y-6 text-gray-300">
            <div className="p-6 bg-gradient-to-r from-blue-900/30 to-purple-900/30 border border-blue-700/50 rounded-xl">
              <h3 className="text-xl font-bold text-blue-300 mb-3">🚀 Master Scriptwriter Prompt</h3>
              <p className="text-blue-200 mb-4">
                Use this prompt with ChatGPT, Claude, or any AI to transform your text into TTS-optimized scripts:
              </p>
              <div className="bg-gray-900/80 p-4 rounded-lg border border-gray-700 font-mono text-sm text-gray-100 max-h-40 overflow-y-auto">
                <pre className="whitespace-pre-wrap">{TTS_MASTER_PROMPT}</pre>
              </div>
              <div className="flex gap-2 mt-3">
                <Button size="sm" variant="ghost" onClick={copyPromptToClipboard}>
                  <IconCopy className="w-3 h-3 mr-1" />
                  Copy
                </Button>
                <Button size="sm" variant="ghost" onClick={downloadPrompt}>
                  <IconDownload className="w-3 h-3 mr-1" />
                  Download
                </Button>
              </div>
            </div>

            <div>
              <h3 className="text-2xl font-bold text-white mb-4">📋 Core Narration Rules</h3>
              
              <div className="space-y-4">
                <div className="p-5 bg-gray-800/50 rounded-xl border border-gray-700">
                  <h4 className="font-bold text-yellow-300 mb-3 text-lg">1. Simplify Punctuation</h4>
                  <div className="space-y-2 text-sm">
                    <p><strong className="text-green-400">✅ Use only:</strong> Periods (.), commas (,), question marks (?), exclamation marks (!)</p>
                    <p><strong className="text-red-400">❌ Never use:</strong> Semicolons (;), em-dashes (—), ellipses (...), colons (:)</p>
                    <p><strong className="text-blue-400">💬 Dialogue:</strong> Use only double quotes (" "). Never single quotes</p>
                  </div>
                </div>

                <div className="p-5 bg-gray-800/50 rounded-xl border border-gray-700">
                  <h4 className="font-bold text-yellow-300 mb-3 text-lg">2. Spell Everything Out</h4>
                  <div className="space-y-3">
                    <div>
                      <p className="font-semibold text-blue-400 mb-2">Numbers & Symbols:</p>
                      <div className="grid md:grid-cols-2 gap-3 text-sm">
                        <div className="space-y-1">
                          <p><span className="text-green-400">✅</span> "twenty twenty-five"</p>
                          <p><span className="text-green-400">✅</span> "three point one four"</p>
                          <p><span className="text-green-400">✅</span> "fifty percent"</p>
                          <p><span className="text-green-400">✅</span> "twenty dollars"</p>
                        </div>
                        <div className="space-y-1">
                          <p><span className="text-red-400">❌</span> "2025"</p>
                          <p><span className="text-red-400">❌</span> "3.14"</p>
                          <p><span className="text-red-400">❌</span> "50%"</p>
                          <p><span className="text-red-400">❌</span> "$20"</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="p-5 bg-gray-800/50 rounded-xl border border-gray-700">
                  <h4 className="font-bold text-yellow-300 mb-3 text-lg">3. Fix Pronunciations</h4>
                  <div className="space-y-3">
                    <div>
                      <p className="font-semibold text-blue-400 mb-2">Difficult Words (use spaces, no hyphens):</p>
                      <div className="grid md:grid-cols-2 gap-3 text-sm">
                        <div className="space-y-1">
                          <p><span className="text-green-400">✅</span> "rez oo may" (résumé)</p>
                          <p><span className="text-green-400">✅</span> "ha la pen yo" (jalapeño)</p>
                          <p><span className="text-green-400">✅</span> "N. A. S. A." (if spelled)</p>
                          <p><span className="text-green-400">✅</span> "Nasa" (if pronounced)</p>
                        </div>
                        <div className="space-y-1">
                          <p><span className="text-red-400">❌</span> "résumé"</p>
                          <p><span className="text-red-400">❌</span> "rez-oo-may"</p>
                          <p><span className="text-red-400">❌</span> "jalapeño"</p>
                          <p><span className="text-red-400">❌</span> "ha-la-pen-yo"</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="p-5 bg-gray-800/50 rounded-xl border border-gray-700">
                  <h4 className="font-bold text-yellow-300 mb-3 text-lg">4. Perfect Sentence Structure</h4>
                  <ul className="list-disc list-inside text-sm space-y-1 text-gray-300">
                    <li>Use clear, direct sentences</li>
                    <li>Break long sentences into shorter ones</li>
                    <li><strong>Critical:</strong> End with a conclusive final sentence to prevent AI loops</li>
                  </ul>
                </div>
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-6">
              <div className="p-5 bg-green-900/20 border border-green-700/50 rounded-xl">
                <h4 className="font-bold text-green-300 mb-3">📝 Mode 1: Script Conversion</h4>
                <p className="text-sm text-gray-300 mb-2">
                  <strong>When:</strong> You have existing text to fix
                </p>
                <p className="text-sm text-gray-300">
                  <strong>Result:</strong> AI rewrites your text following all rules without changing meaning
                </p>
              </div>

              <div className="p-5 bg-purple-900/20 border border-purple-700/50 rounded-xl">
                <h4 className="font-bold text-purple-300 mb-3">✨ Mode 2: Script Generation</h4>
                <p className="text-sm text-gray-300 mb-2">
                  <strong>When:</strong> You want new content created
                </p>
                <p className="text-sm text-gray-300">
                  <strong>Result:</strong> AI creates original content already optimized for TTS
                </p>
              </div>
            </div>

            <div className="p-6 bg-gradient-to-r from-red-900/20 to-orange-900/20 border border-red-700/50 rounded-xl">
              <h4 className="font-bold text-red-300 mb-3 text-lg">🎯 Why This Matters</h4>
              <p className="text-gray-300 mb-3">
                Following these rules prevents common TTS issues:
              </p>
              <div className="grid md:grid-cols-2 gap-4 text-sm">
                <ul className="space-y-1">
                  <li>🔄 Audio looping</li>
                  <li>🗣️ Pronunciation errors</li>
                  <li>🎭 Wrong emotional tone</li>
                </ul>
                <ul className="space-y-1">
                  <li>🔤 Gibberish output</li>
                  <li>⏸️ Awkward pauses</li>
                  <li>🔚 Unclear endings</li>
                </ul>
              </div>
            </div>
          </div>

          <div className="mt-8 flex justify-center gap-3">
            <Button variant="primary" size="lg" onClick={copyPromptToClipboard}>
              <IconCopy className="w-5 h-5 mr-2" />
              Copy Prompt & Start Writing
            </Button>
            <Button variant="ghost" onClick={() => setShowTtsGuide(false)}>
              Close Guide
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
};