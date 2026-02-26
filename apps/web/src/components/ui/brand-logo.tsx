'use client';

import React from 'react';

interface BrandLogoProps {
  size?: number;
  className?: string;
}

/** Private LLM brand logo — lock + AI sparkle on indigo gradient */
export function BrandLogo({ size = 32, className }: BrandLogoProps): React.ReactNode {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 40 40"
      fill="none"
      width={size}
      height={size}
      className={className}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="pllm-bg" x1="0" y1="0" x2="40" y2="40" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#4F46E5" />
          <stop offset="100%" stopColor="#7C3AED" />
        </linearGradient>
        <linearGradient id="pllm-lock" x1="14" y1="10" x2="26" y2="32" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#E0E7FF" />
          <stop offset="100%" stopColor="#C7D2FE" />
        </linearGradient>
      </defs>
      <rect width="40" height="40" rx="10" fill="url(#pllm-bg)" />
      <rect x="13" y="18" width="14" height="12" rx="2.5" fill="url(#pllm-lock)" />
      <path d="M16 18V14a4 4 0 0 1 8 0v4" stroke="#E0E7FF" strokeWidth="2.2" strokeLinecap="round" fill="none" />
      <circle cx="20" cy="23.5" r="1.8" fill="#4F46E5" />
      <line x1="20" y1="20.5" x2="20" y2="21.5" stroke="#4F46E5" strokeWidth="1.2" strokeLinecap="round" />
      <line x1="20" y1="25.5" x2="20" y2="26.5" stroke="#4F46E5" strokeWidth="1.2" strokeLinecap="round" />
      <line x1="17.5" y1="23.5" x2="18.5" y2="23.5" stroke="#4F46E5" strokeWidth="1.2" strokeLinecap="round" />
      <line x1="21.5" y1="23.5" x2="22.5" y2="23.5" stroke="#4F46E5" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}
