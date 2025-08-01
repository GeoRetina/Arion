import React from "react";

/**
 * Splits the given text into React nodes where mentions (e.g. `@layer name`) are
 * wrapped in a styled <span>. A mention can include multiple words separated by
 * a single space. 
 * 
 * The matching stops right before the NBSP (\u00A0) automatically inserted by the
 * mention system on completion or at the end of the string, ensuring that words
 * typed after the mention are **not** included in the highlight.
 */
export const highlightMentions = (
  text: string | null | undefined
): React.ReactNode[] => {
  if (!text) return [];

  // Matches a mention and stops before the NBSP (\u00A0) or end-of-string.
  const mentionRegex = /(@[A-Za-z0-9_\-\.\s]+?)(?=\u00A0|$)/g;
  const parts = text.split(mentionRegex);

  return parts.map((part, index) => {
    if (mentionRegex.test(part)) {
      return (
        <span
          key={index}
          className="inline-block bg-blue-100 dark:bg-yellow-800/40 dark:text-yellow-300 px-1.5 py-0 rounded-md font-normal align-baseline"
        >
          {part}
        </span>
      );
    }
    return part;
  });
};