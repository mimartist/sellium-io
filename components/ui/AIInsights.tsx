"use client";

import { useState } from "react";
import { AIIcon } from "./AIIcons";
import { COLORS } from "@/lib/design-tokens";

export interface Insight {
  type: string;
  title: string;
  desc: string;
  color: string;
}

interface AIInsightsProps {
  title?: string;
  subtitle?: string;
  insights: Insight[];
}

export default function AIInsights({
  title = "AI Recommendations",
  subtitle = "AI-powered recommendations",
  insights,
}: AIInsightsProps) {
  const [expanded, setExpanded] = useState<number | null>(null);
  const [minimized, setMinimized] = useState(false);

  return (
    <div className="ai-chat-outer" style={{ marginBottom: 20 }}>
      <div className="ai-chat-inner">
        <div className="ai-chat-bg" />
        <div style={{ position: "relative", zIndex: 1 }}>
          {/* Header */}
          <div
            style={{
              padding: "18px 24px",
              display: "flex",
              alignItems: "center",
              gap: 10,
            }}
          >
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: "50%",
                background:
                  "linear-gradient(135deg,#667eea,#764ba2,#f093fb)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: "0 4px 15px rgba(118,75,162,.2)",
                flexShrink: 0,
              }}
            >
              <AIIcon s={18} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontSize: 16,
                  fontWeight: 700,
                  color: COLORS.text,
                }}
              >
                {title}
              </div>
              <div style={{ fontSize: 11, color: COLORS.sub }}>
                {subtitle}
              </div>
            </div>
            <div
              style={{
                fontSize: 10,
                fontWeight: 600,
                padding: "3px 12px",
                borderRadius: 20,
                background: "rgba(91,95,199,.08)",
                color: COLORS.accent,
                marginRight: 8,
              }}
            >
              {insights.length} insights
            </div>
            {/* Minimize/Maximize toggle */}
            <button
              onClick={() => setMinimized(!minimized)}
              style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                border: "1px solid rgba(91,95,199,.12)",
                background: "rgba(255,255,255,.7)",
                backdropFilter: "blur(4px)",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                transition: "all .2s",
                flexShrink: 0,
              }}
              title={minimized ? "Expand" : "Collapse"}
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke={COLORS.accent}
                strokeWidth="2"
                strokeLinecap="round"
              >
                {minimized ? (
                  <>
                    <polyline points="15 3 21 3 21 9" />
                    <polyline points="9 21 3 21 3 15" />
                    <line x1="21" y1="3" x2="14" y2="10" />
                    <line x1="3" y1="21" x2="10" y2="14" />
                  </>
                ) : (
                  <>
                    <polyline points="4 14 10 14 10 20" />
                    <polyline points="20 10 14 10 14 4" />
                    <line x1="14" y1="10" x2="21" y2="3" />
                    <line x1="3" y1="21" x2="10" y2="14" />
                  </>
                )}
              </svg>
            </button>
          </div>

          {/* Insight cards — collapsible */}
          <div
            style={{
              maxHeight: minimized ? 62 : insights.length * 100,
              overflow: "hidden",
              transition: "max-height 0.4s ease",
              padding: minimized ? "0 24px 16px" : "0 24px 20px",
            }}
          >
            {minimized ? (
              /* Minimized: single summary line */
              <div
                style={{
                  display: "flex",
                  gap: 8,
                  alignItems: "center",
                  padding: "10px 16px",
                  background: "rgba(255,255,255,.75)",
                  backdropFilter: "blur(8px)",
                  borderRadius: 10,
                  cursor: "pointer",
                }}
                onClick={() => setMinimized(false)}
              >
                <AIIcon s={14} />
                <span
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: COLORS.text,
                    flex: 1,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {insights[0]?.title}
                </span>
                {insights.length > 1 && (
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 600,
                      color: COLORS.accent,
                      flexShrink: 0,
                    }}
                  >
                    +{insights.length - 1} more
                  </span>
                )}
              </div>
            ) : (
              /* Expanded: all insights */
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {insights.map((ins, i) => (
                  <div
                    key={i}
                    onClick={() => setExpanded(expanded === i ? null : i)}
                    style={{
                      background: "rgba(255,255,255,.85)",
                      backdropFilter: "blur(8px)",
                      borderRadius: 10,
                      padding: "14px 18px",
                      boxShadow: `0 2px 8px ${ins.color}15`,
                      transition: "all .2s",
                      transform: expanded === i ? "scale(1.005)" : "scale(1)",
                      cursor: "pointer",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        marginBottom: 4,
                      }}
                    >
                      <span
                        style={{
                          width: 6,
                          height: 6,
                          borderRadius: "50%",
                          background: ins.color,
                          flexShrink: 0,
                        }}
                      />
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 700,
                          color: ins.color,
                          letterSpacing: ".03em",
                        }}
                      >
                        {ins.type}
                      </span>
                      <span
                        style={{
                          marginLeft: "auto",
                          fontSize: 16,
                          color: ins.color,
                          opacity: 0.4,
                          transform: expanded === i ? "rotate(180deg)" : "",
                          transition: "transform .2s",
                        }}
                      >
                        ⌄
                      </span>
                    </div>
                    <div
                      style={{
                        fontSize: 14,
                        fontWeight: 600,
                        color: COLORS.text,
                        lineHeight: 1.4,
                      }}
                    >
                      {ins.title}
                    </div>
                    {expanded === i && (
                      <div
                        style={{
                          fontSize: 13,
                          color: "#64748B",
                          lineHeight: 1.7,
                          marginTop: 8,
                        }}
                      >
                        {ins.desc}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
