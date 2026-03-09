"use client";

import { useState, useRef, useEffect, useCallback, forwardRef, useImperativeHandle } from "react";
import styles from "./styles.module.scss";
import { IconTrash } from "../icons";
import { originalSetTimeout } from "../../utils/freeze-animations";
import type { ChildComponentNode } from "../../utils/react-detection";

// =============================================================================
// Types
// =============================================================================

export interface AnnotationPopupCSSProps {
  /** Element name to display in header */
  element: string;
  /** Optional timestamp display (e.g., "@ 1.23s" for animation feedback) */
  timestamp?: string;
  /** Optional selected/highlighted text */
  selectedText?: string;
  /** Placeholder text for the textarea */
  placeholder?: string;
  /** Initial value for textarea (for edit mode) */
  initialValue?: string;
  /** Label for submit button (default: "Add") */
  submitLabel?: string;
  /** Called when annotation is submitted with text */
  onSubmit: (text: string) => void;
  /** Called when popup is cancelled/dismissed */
  onCancel: () => void;
  /** Called when delete button is clicked (only shown if provided) */
  onDelete?: () => void;
  /** Position styles (left, top) */
  style?: React.CSSProperties;
  /** Custom color for submit button and textarea focus (hex) */
  accentColor?: string;
  /** External exit state (parent controls exit animation) */
  isExiting?: boolean;
  /** Light mode styling */
  lightMode?: boolean;
  /** Computed styles for the selected element */
  computedStyles?: Record<string, string>;
  /** Child components with depth info */
  childComponents?: ChildComponentNode[];
  /** Source file location of the innermost React component */
  sourceLocation?: string;
  /** React props */
  props?: Record<string, any>;
  /** React component name (innermost) */
  componentName?: string;
}

export interface AnnotationPopupCSSHandle {
  /** Shake the popup (e.g., when user clicks outside) */
  shake: () => void;
}

// =============================================================================
// Props Viewer
// =============================================================================

const PropsViewer = ({ data, name = "initial_props" }: { data: any; name?: string }) => {
  const [expanded, setExpanded] = useState(false);

  if (typeof data !== "object" || data === null) {
    let displayValue = String(data);
    if (typeof data === "string") displayValue = `"${data}"`;
    return (
      <div style={{ paddingLeft: "16px", fontSize: "12px", fontFamily: "monospace", color: "#e5e5e5" }}>
        <span style={{ color: "#a5d6ff" }}>{name}: </span>
        <span style={{ color: typeof data === "number" || typeof data === "boolean" ? "#79c0ff" : "#ff7b72" }}>
          {displayValue}
        </span>
      </div>
    );
  }

  const isArray = Array.isArray(data);
  const keys = Object.keys(data);
  if (keys.length === 0) {
    return (
      <div style={{ paddingLeft: "16px", fontSize: "12px", fontFamily: "monospace", color: "#e5e5e5" }}>
        <span style={{ color: "#a5d6ff" }}>{name}: </span>
        <span>{isArray ? "[]" : "{}"}</span>
      </div>
    );
  }

  if (name === "initial_props") {
    return (
      <div style={{ fontSize: "12px", fontFamily: "monospace", color: "#e5e5e5" }}>
        <div style={{ borderLeft: "1px solid rgba(255,255,255,0.1)", marginLeft: "6px" }}>
          {keys.map((key) => (
            <PropsViewer key={key} name={key} data={data[key as keyof typeof data]} />
          ))}
        </div>
      </div>
    )
  }
  return (
    <div style={{ paddingLeft: "16px", fontSize: "12px", fontFamily: "monospace", color: "#e5e5e5" }}>
      <div
        onClick={() => setExpanded(!expanded)}
        style={{ cursor: "pointer", display: "flex", alignItems: "center", gap: "4px" }}
      >
        <span style={{ display: "inline-block", width: "12px", textAlign: "center", color: "#8b949e", fontSize: "10px" }}>
          {expanded ? "▼" : "▶"}
        </span>
        <span style={{ color: "#a5d6ff", paddingBottom: "2px" }}>{name}: </span>
        <span style={{ color: "#8b949e", paddingBottom: "2px" }}>{isArray ? "[...]" : "{...}"}</span>
      </div>
      {expanded && (
        <div style={{ paddingLeft: "8px", borderLeft: "1px solid rgba(255,255,255,0.1)", marginLeft: "6px" }}>
          {keys.map((key) => (
            <PropsViewer key={key} name={key} data={data[key as keyof typeof data]} />
          ))}
        </div>
      )}
    </div>
  );
};

// =============================================================================
// Component
// =============================================================================

export const AnnotationPopupCSS = forwardRef<AnnotationPopupCSSHandle, AnnotationPopupCSSProps>(
  function AnnotationPopupCSS(
    {
      element,
      timestamp,
      selectedText,
      placeholder = "What should change?",
      initialValue = "",
      submitLabel = "Add",
      onSubmit,
      onCancel,
      onDelete,
      style,
      accentColor = "#3c82f7",
      isExiting = false,
      lightMode = false,
      computedStyles,
      childComponents,
      sourceLocation,
      props,
      componentName
    },
    ref
  ) {
    const [text, setText] = useState(initialValue);
    const [isShaking, setIsShaking] = useState(false);
    const [animState, setAnimState] = useState<"initial" | "enter" | "entered" | "exit">("initial");
    const [isFocused, setIsFocused] = useState(false);
    const [isStylesExpanded, setIsStylesExpanded] = useState(false); // Computed styles accordion state
    const [isParentComponentsExpanded, setIsParentComponentsExpanded] = useState(false); // Parent components accordion state
    const [isChildrenExpanded, setIsChildrenExpanded] = useState(false); // Child components accordion state
    const [isPropsExpanded, setIsPropsExpanded] = useState(false); // Props accordion state
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const popupRef = useRef<HTMLDivElement>(null);
    const cancelTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const shakeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const bracketMatches = element.match(/<([^>]+)>/g) || [];
    const parentComponents = bracketMatches.slice(0, -1).map(m => m.replace(/[<>]/g, ''));

    // Sync with parent exit state
    useEffect(() => {
      if (isExiting && animState !== "exit") {
        setAnimState("exit");
      }
    }, [isExiting, animState]);

    // Animate in on mount and focus textarea
    useEffect(() => {
      // Start enter animation (use originalSetTimeout to bypass freeze patch)
      originalSetTimeout(() => {
        setAnimState("enter");
      }, 0);
      // Transition to entered state after animation completes
      const enterTimer = originalSetTimeout(() => {
        setAnimState("entered");
      }, 200); // Match animation duration
      const focusTimer = originalSetTimeout(() => {
        const textarea = textareaRef.current;
        if (textarea) {
          textarea.focus();
          textarea.selectionStart = textarea.selectionEnd = textarea.value.length;
          textarea.scrollTop = textarea.scrollHeight;
        }
      }, 50);
      return () => {
        clearTimeout(enterTimer);
        clearTimeout(focusTimer);
        if (cancelTimerRef.current) clearTimeout(cancelTimerRef.current);
        if (shakeTimerRef.current) clearTimeout(shakeTimerRef.current);
      };
    }, []);

    // Shake animation
    const shake = useCallback(() => {
      if (shakeTimerRef.current) clearTimeout(shakeTimerRef.current);
      setIsShaking(true);
      shakeTimerRef.current = originalSetTimeout(() => {
        setIsShaking(false);
        textareaRef.current?.focus();
      }, 250);
    }, []);

    // Expose shake to parent via ref
    useImperativeHandle(ref, () => ({
      shake,
    }), [shake]);

    // Handle cancel with exit animation
    const handleCancel = useCallback(() => {
      setAnimState("exit");
      cancelTimerRef.current = originalSetTimeout(() => {
        onCancel();
      }, 150); // Match exit animation duration
    }, [onCancel]);

    // Handle submit
    const handleSubmit = useCallback(() => {
      if (!text.trim()) return;
      onSubmit(text.trim());
    }, [text, onSubmit]);

    // Handle keyboard
    const handleKeyDown = useCallback(
      (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.nativeEvent.isComposing) return;
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          handleSubmit();
        }
        if (e.key === "Escape") {
          handleCancel();
        }
      },
      [handleSubmit, handleCancel]
    );

    const popupClassName = [
      styles.popup,
      lightMode ? styles.light : "",
      animState === "enter" ? styles.enter : "",
      animState === "entered" ? styles.entered : "",
      animState === "exit" ? styles.exit : "",
      isShaking ? styles.shake : "",
    ].filter(Boolean).join(" ");

    return (
      <div
        ref={popupRef}
        className={popupClassName}
        data-annotation-popup
        style={style}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Source location badge */}
        {sourceLocation && (
          <div
            title={sourceLocation}
            style={{
              display: "inline-flex",
              alignItems: "center",
              padding: "2px 6px",
              borderRadius: "4px",
              background: lightMode ? "rgba(0,0,0,0.06)" : "rgba(255,255,255,0.1)",
              fontSize: "9px",
              fontWeight: 600,
              color: lightMode ? "rgba(0,0,0,0.6)" : "rgba(255,255,255,0.7)",
              whiteSpace: "nowrap",
              marginBottom: "6px",
            }}
          >
            <svg style={{ marginRight: 4, opacity: 0.7 }} width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
            {sourceLocation.split('/').pop()}
          </div>
        )}

        <div style={{
          fontSize: "15px",
          fontWeight: 600,
          color: lightMode ? "#111" : "#fff",
          marginBottom: parentComponents.length > 0 ? "4px" : "10px",
          lineHeight: 1.3,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}>
          <span>{componentName}</span>
          {timestamp && <span className={styles.timestamp}>{timestamp}</span>}
        </div>
        {/* --- Metadata Accordions --- */}
        <div style={{ display: "flex", flexDirection: "column", gap: 0, marginBottom: "12px", borderRadius: "6px", border: lightMode ? "1px solid rgba(0,0,0,0.08)" : "1px solid rgba(255,255,255,0.1)" }}>


          {/* Parent components breadcrumb */}
          <div className={`${styles.infoAccordion} ${isParentComponentsExpanded ? styles.expanded : ""}`} style={{ borderTop: "none" }}>
            <button
              className={styles.accordionHeader}
              onClick={() => setIsParentComponentsExpanded(!isParentComponentsExpanded)}
              type="button"
            >
              <svg className={`${styles.chevron} ${isParentComponentsExpanded ? styles.expanded : ""}`} width="12" height="12" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M5.5 10.25L9 7.25L5.75 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span className={styles.label}>Parent Components</span>
              <span className={styles.count}>{parentComponents.length}</span>
            </button>
            {isParentComponentsExpanded && parentComponents.length > 0 && (
              <div className={styles.infoAccordionContent}>
                {parentComponents.map((name, idx) => (
                  <div
                    key={`${name}-${idx}`}
                    style={{
                      paddingLeft: (idx) * 12,
                      lineHeight: "20px",
                      fontSize: "11px",
                      fontFamily: "monospace",
                      display: "flex",
                      alignItems: "center",
                      gap: 4
                    }}
                  >
                    <span style={{ color: lightMode ? "rgba(0,0,0,0.3)" : "rgba(255,255,255,0.3)" }}>
                      {idx > 0 && "└"}
                    </span>
                    <span style={{
                      color: lightMode ? "#e36209" : "#ff7b72", // GitHub syntax orange/red
                      fontWeight: 600
                    }}>
                      &lt;{name}&gt;
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
          {/* Computed Styles Accordion */}
          {computedStyles && Object.keys(computedStyles).length > 0 && (
            <div className={`${styles.infoAccordion} ${isStylesExpanded ? styles.expanded : ""}`}>
              <button
                className={styles.accordionHeader}
                onClick={() => setIsStylesExpanded(!isStylesExpanded)}
                type="button"
              >
                <svg className={`${styles.chevron} ${isStylesExpanded ? styles.expanded : ""}`} width="12" height="12" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M5.5 10.25L9 7.25L5.75 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span className={styles.label}>Styles</span>
                <span className={styles.count}>{Object.keys(computedStyles).length}</span>
              </button>
              {isStylesExpanded && <div className={styles.infoAccordionInner}>
                <div className={styles.infoAccordionContent}>
                  <div className={styles.stylesBlock}>
                    {Object.entries(computedStyles).map(([key, value]) => (
                      <div key={key} className={styles.styleLine}>
                        <span className={styles.styleProperty}>{key.replace(/([A-Z])/g, "-$1").toLowerCase()}</span>
                        <span style={{ opacity: 0.5 }}>:</span>
                        <span className={styles.styleValue}>{value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>}
            </div>
          )}

          {/* Child Components Accordion */}
          {childComponents && childComponents.length > 0 && (
            <div className={`${styles.infoAccordion} ${isChildrenExpanded ? styles.expanded : ""}`}>
              <button
                className={styles.accordionHeader}
                onClick={() => setIsChildrenExpanded(!isChildrenExpanded)}
                type="button"
              >
                <svg className={`${styles.chevron} ${isChildrenExpanded ? styles.expanded : ""}`} width="12" height="12" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M5.5 10.25L9 7.25L5.75 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span className={styles.label}>Children</span>
                <span className={styles.count}>{childComponents.length}</span>
              </button>
              {isChildrenExpanded && <div className={styles.infoAccordionInner}>
                <div className={styles.infoAccordionContent} style={{ paddingTop: 0 }}>
                  {childComponents.map((child, idx) => (
                    <div
                      key={`${child.name}-${idx}`}
                      style={{
                        paddingLeft: (child.level - 1) * 12,
                        lineHeight: "20px",
                        fontSize: "11px",
                        fontFamily: "monospace",
                        display: "flex",
                        alignItems: "center",
                        gap: 4
                      }}
                    >
                      <span style={{ color: lightMode ? "rgba(0,0,0,0.3)" : "rgba(255,255,255,0.3)" }}>
                        {child.level > 1 && "└"}
                      </span>
                      <span style={{
                        color: lightMode ? "#e36209" : "#ff7b72", // GitHub syntax orange/red
                        fontWeight: 600
                      }}>
                        &lt;{child.name}&gt;
                      </span>
                    </div>
                  ))}
                </div>
              </div>}
            </div>
          )}

          {/* Props Accordion */}
          {props && Object.keys(props).length > 0 && (
            <div className={`${styles.infoAccordion} ${isPropsExpanded ? styles.expanded : ""}`}>
              <button
                className={styles.accordionHeader}
                onClick={() => setIsPropsExpanded(!isPropsExpanded)}
                type="button"
              >
                <svg className={`${styles.chevron} ${isPropsExpanded ? styles.expanded : ""}`} width="12" height="12" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M5.5 10.25L9 7.25L5.75 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span className={styles.label}>React Props</span>
                <span className={styles.count}>{Object.keys(props).length}</span>
              </button>
              {isPropsExpanded && <div className={styles.infoAccordionInner}>
                <div className={styles.infoAccordionContent} style={{ paddingTop: 0 }}>
                  <div style={{
                    background: lightMode ? "rgba(0,0,0,0.02)" : "rgba(0,0,0,0.15)",
                    border: lightMode ? "1px solid rgba(0,0,0,0.05)" : "1px solid rgba(255,255,255,0.05)",
                    borderRadius: "4px",
                    padding: "4px",
                  }}>
                    <PropsViewer data={props} name="initial_props" />
                  </div>
                </div>
              </div>}
            </div>
          )}

        </div> {/* End Meta Section */}

        {selectedText && (
          <div className={styles.quote}>
            &ldquo;{selectedText.slice(0, 80)}
            {selectedText.length > 80 ? "..." : ""}&rdquo;
          </div>
        )}

        <textarea
          ref={textareaRef}
          className={styles.textarea}
          style={{ borderColor: isFocused ? accentColor : undefined, boxSizing: "border-box" }}
          placeholder={placeholder}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          rows={2}
          onKeyDown={handleKeyDown}
        />

        <div className={styles.actions}>
          {onDelete && (
            <div className={styles.deleteWrapper}>
              <button className={styles.deleteButton} onClick={onDelete} type="button">
                <IconTrash size={22} />
              </button>
            </div>
          )}
          <button className={styles.cancel} onClick={handleCancel}>
            Cancel
          </button>
          <button
            className={styles.submit}
            style={{
              backgroundColor: accentColor,
              opacity: text.trim() ? 1 : 0.4,
            }}
            onClick={handleSubmit}
            disabled={!text.trim()}
          >
            {submitLabel}
          </button>
        </div>
      </div>
    );
  }
);

export default AnnotationPopupCSS;
