import { afterEach, describe, expect, it } from "vitest";
import { getAnnotationLocator, getElementLocator } from "./element-locator";

function target(markup: string): Element {
  document.body.innerHTML = markup;
  const element = document.getElementById("target");
  if (!element) throw new Error("Test target is missing");
  return element;
}

afterEach(() => { document.body.innerHTML = ""; });

describe("element locator", () => {
  it("includes both test ID and the native accessibility role/name", () => {
    expect(getElementLocator(target('<button id="target" data-testid="save-report">Save report</button>'))).toBe(
      'Find the component that has data test ID (data-testid) equal to "save-report" and accessibility role equal to "button" and name equal to "Save report".',
    );
  });

  it("uses explicit roles and aria-label instead of visible text", () => {
    expect(getElementLocator(target('<div id="target" role="button" aria-label="Save report">Icon</div>'))).toBe(
      'Find the component that has accessibility role equal to "button" and name equal to "Save report".',
    );
  });

  it("resolves aria-labelledby before aria-label", () => {
    expect(getElementLocator(target('<div><span id="label">Annual report</span><button id="target" aria-labelledby="label" aria-label="Other">Save</button></div>'))).toContain(
      'name equal to "Annual report"',
    );
  });

  it("reads the associated label of an input", () => {
    expect(getElementLocator(target('<div><label for="target">Email address</label><input id="target"></div>'))).toContain(
      'accessibility role equal to "textbox" and name equal to "Email address"',
    );
  });

  it("supports data-test-id and preserves quotes in the value", () => {
    expect(getElementLocator(target('<div id="target" data-test-id="save &quot;report&quot;"></div>'))).toBe(
      'Find the component that has data test ID (data-test-id) equal to "save \\"report\\"".',
    );
  });

  it("keeps an unnamed role without inventing a name", () => {
    expect(getElementLocator(target('<div id="target" role="dialog"></div>'))).toBe(
      'Find the component that has accessibility role equal to "dialog".',
    );
  });

  it("finds identifiers on the nearest ancestor", () => {
    expect(getElementLocator(target('<button data-testid="save" aria-label="Save"><span id="target">Icon</span></button>'))).toBe(
      'Find the component whose ancestor has data test ID (data-testid) equal to "save" and accessibility role equal to "button" and name equal to "Save".',
    );
  });

  it("keeps self and ancestor identifiers in separate clauses", () => {
    expect(getElementLocator(target('<div role="dialog" aria-label="Settings"><div id="target" data-testid="panel"></div></div>'))).toBe(
      'Find the component that has data test ID (data-testid) equal to "panel". Find the component whose ancestor has accessibility role equal to "dialog" and name equal to "Settings".',
    );
  });

  it("uses nearby descendants and adjacent sibling branches", () => {
    expect(getElementLocator(target('<div><div id="target"><span><button aria-label="Save">Save</button></span></div><div><span data-testid="save-panel"></span></div></div>'))).toContain(
      'whose nearby component has data test ID (data-testid) equal to "save-panel"',
    );
  });

  it("does not assign an implicit region role to an unnamed section", () => {
    expect(getElementLocator(target('<section id="target" class="DevSection"></section>'))).toBeUndefined();
  });

  it("does not scan distant page elements", () => {
    expect(getElementLocator(target('<div><div id="target"></div><div></div><button data-testid="far-away">Save</button></div>'))).toBeUndefined();
  });

  it("does not treat the whole page as a nearby component", () => {
    document.body.innerHTML = '<button data-testid="far-away">Save</button>';
    expect(getElementLocator(document.body)).toBeUndefined();
  });

  it.each([
    '<div hidden data-testid="hidden">Hidden</div>',
    '<button aria-hidden="true" data-testid="hidden">Hidden</button>',
    '<button style="display:none" data-testid="hidden">Hidden</button>',
    '<div data-feedback-toolbar><button data-testid="toolbar">Copy</button></div>',
  ])("ignores hidden elements and the toolbar: %s", (nearby) => {
    expect(getElementLocator(target(`<div><div id="target"></div>${nearby}</div>`))).toBeUndefined();
  });

  it("crosses shadow roots to find ancestor identifiers", () => {
    const host = target('<div id="target" data-testid="shadow-panel" role="dialog" aria-label="Settings"></div>');
    const root = host.attachShadow({ mode: "open" });
    root.innerHTML = "<span>Icon</span>";
    const child = root.firstElementChild;
    if (!child) throw new Error("Shadow target is missing");
    expect(getElementLocator(child)).toContain('whose ancestor has data test ID (data-testid) equal to "shadow-panel"');
    expect(getElementLocator(child)).toContain('accessibility role equal to "dialog" and name equal to "Settings"');
  });

  it("gives a position fallback for saved annotations without captured identifiers", () => {
    expect(getAnnotationLocator({ id: "old", x: 50, y: 100, comment: "Change", element: "DevSection", elementPath: "div", timestamp: 0 })).toContain(
      "No data test ID or accessibility role/name was captured.",
    );
  });
});
