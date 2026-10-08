import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { PageFeedbackToolbarCSS } from "./index";
import type { Annotation } from "../../types";

// Mock clipboard API
const mockClipboard = {
  writeText: vi.fn().mockResolvedValue(undefined),
};

beforeEach(() => {
  vi.stubGlobal("localStorage", document.defaultView?.localStorage);
  localStorage.clear();
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
  vi.stubGlobal("navigator", {
    clipboard: mockClipboard,
    userAgent: "test-agent",
  });
  mockClipboard.writeText.mockClear();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  Reflect.deleteProperty(document, "elementFromPoint");
  vi.unstubAllGlobals();
});

describe("PageFeedbackToolbarCSS", () => {
  describe("locator output", () => {
    it.each(["compact", "standard", "detailed", "forensic"])(
      "copies saved identifiers in %s mode",
      async (outputDetail) => {
        const locator = 'Find the component that has data test ID (data-testid) equal to "save-report" and accessibility role equal to "button" and name equal to "Save report".';
        localStorage.setItem("feedback-toolbar-settings", JSON.stringify({ outputDetail }));
        localStorage.setItem(`feedback-annotations-${window.location.pathname}`, JSON.stringify([{
          id: "saved",
          x: 50,
          y: 100,
          element: "div section",
          elementPath: "div > section",
          elementLocator: locator,
          componentName: "DevSection",
          sourceLocation: "wrong.tsx:1",
          comment: "Make the button larger",
          timestamp: Date.now(),
        }]));
        const onCopy = vi.fn();
        render(<PageFeedbackToolbarCSS onCopy={onCopy} />);
        fireEvent.click(screen.getByTitle("Start feedback mode"));
        await waitFor(() => expect(screen.getByText("Copy feedback")).toBeDefined());
        fireEvent.keyDown(document, { key: "c" });
        await waitFor(() => expect(mockClipboard.writeText).toHaveBeenCalledOnce());
        const output = mockClipboard.writeText.mock.calls[0][0];
        expect(output).toContain(locator);
        expect(output).toContain("Make the button larger");
        expect(output).not.toContain("DevSection");
        expect(output).not.toContain("Possible component");
        expect(onCopy).toHaveBeenCalledWith(output);
      },
    );

    it("captures ancestor identifiers when annotating a nested element", async () => {
      const onAnnotationAdd = vi.fn();
      render(<>
        <button data-testid="save-report" aria-label="Save report"><span>Save</span></button>
        <PageFeedbackToolbarCSS onAnnotationAdd={onAnnotationAdd} />
      </>);
      const target = screen.getByText("Save");
      // jsdom has no layout or hit testing. The browser test covers real hit testing.
      Object.defineProperty(document, "elementFromPoint", { configurable: true, value: () => target });
      fireEvent.click(screen.getByTitle("Start feedback mode"));
      await waitFor(() => expect(screen.getByText("Copy feedback")).toBeDefined());
      fireEvent.click(target, { clientX: 100, clientY: 100 });
      fireEvent.change(await screen.findByPlaceholderText("What should change?"), { target: { value: "Make the button larger" } });
      fireEvent.click(screen.getByRole("button", { name: "Add" }));
      await waitFor(() => expect(onAnnotationAdd).toHaveBeenCalledOnce());
      const annotation = onAnnotationAdd.mock.calls[0][0];
      expect(annotation.elementLocator).toContain("whose ancestor has");
      expect(annotation.elementLocator).toContain('data test ID (data-testid) equal to "save-report"');
      expect(annotation.elementLocator).toContain('accessibility role equal to "button" and name equal to "Save report"');
    });
  });

  describe("onAnnotationAdd callback", () => {
    it("should accept onAnnotationAdd prop without errors", () => {
      const handleAnnotation = vi.fn();
      expect(() =>
        render(<PageFeedbackToolbarCSS onAnnotationAdd={handleAnnotation} />)
      ).not.toThrow();
    });

    it("should type-check annotation callback parameter", () => {
      // This test verifies TypeScript types are correct at compile time
      const handleAnnotation = (annotation: Annotation) => {
        // Verify all expected properties are accessible
        expect(annotation).toHaveProperty("id");
        expect(annotation).toHaveProperty("x");
        expect(annotation).toHaveProperty("y");
        expect(annotation).toHaveProperty("comment");
        expect(annotation).toHaveProperty("element");
        expect(annotation).toHaveProperty("elementPath");
        expect(annotation).toHaveProperty("timestamp");
      };

      render(<PageFeedbackToolbarCSS onAnnotationAdd={handleAnnotation} />);
    });
  });

  describe("copyToClipboard prop", () => {
    it("should default copyToClipboard to true", () => {
      // Component should render without explicit copyToClipboard prop
      expect(() => render(<PageFeedbackToolbarCSS />)).not.toThrow();
    });

    it("should accept copyToClipboard={false} without errors", () => {
      expect(() =>
        render(<PageFeedbackToolbarCSS copyToClipboard={false} />)
      ).not.toThrow();
    });

    it("should accept copyToClipboard={true} without errors", () => {
      expect(() =>
        render(<PageFeedbackToolbarCSS copyToClipboard={true} />)
      ).not.toThrow();
    });
  });

  describe("combined props", () => {
    it("should accept both onAnnotationAdd and copyToClipboard props", () => {
      const handleAnnotation = vi.fn();
      expect(() =>
        render(
          <PageFeedbackToolbarCSS
            onAnnotationAdd={handleAnnotation}
            copyToClipboard={false}
          />
        )
      ).not.toThrow();
    });
  });
});

describe("Annotation type", () => {
  it("should include all required fields", () => {
    const annotation: Annotation = {
      id: "test-id",
      x: 50,
      y: 100,
      comment: "Test comment",
      element: "Button",
      elementPath: "body > div > button",
      timestamp: Date.now(),
    };

    expect(annotation.id).toBe("test-id");
    expect(annotation.x).toBe(50);
    expect(annotation.y).toBe(100);
    expect(annotation.comment).toBe("Test comment");
    expect(annotation.element).toBe("Button");
    expect(annotation.elementPath).toBe("body > div > button");
    expect(typeof annotation.timestamp).toBe("number");
  });

  it("should allow optional metadata fields", () => {
    const annotation: Annotation = {
      id: "test-id",
      x: 50,
      y: 100,
      comment: "Test comment",
      element: "Button",
      elementPath: "body > div > button",
      timestamp: Date.now(),
      selectedText: "Selected text content",
      boundingBox: { x: 100, y: 200, width: 150, height: 40 },
      nearbyText: "Context around the element",
      cssClasses: "btn btn-primary",
      nearbyElements: "div, span, a",
      computedStyles: "color: blue; font-size: 14px",
      fullPath: "html > body > div#app > main > button.btn",
      accessibility: "role=button, aria-label=Submit",
      isMultiSelect: false,
      isFixed: false,
    };

    expect(annotation.selectedText).toBe("Selected text content");
    expect(annotation.boundingBox).toEqual({
      x: 100,
      y: 200,
      width: 150,
      height: 40,
    });
    expect(annotation.cssClasses).toBe("btn btn-primary");
    expect(annotation.fullPath).toBe("html > body > div#app > main > button.btn");
    expect(annotation.accessibility).toBe("role=button, aria-label=Submit");
    expect(annotation.isMultiSelect).toBe(false);
    expect(annotation.isFixed).toBe(false);
  });
});
