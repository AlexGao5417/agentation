import { computeAccessibleName, getRole, isInaccessible } from "dom-accessibility-api";
import { closestCrossingShadow } from "./element-identification";
import type { Annotation } from "../types";

type Identifier =
  | { kind: "test-id"; attribute: string; value: string }
  | { kind: "role"; role: string; name: string }
  | { kind: "name"; value: string };

const TEST_ID_ATTRIBUTES = ["data-testid", "data-test-id"];
const EXCLUDED_ELEMENTS =
  "[data-feedback-toolbar], [data-annotation-popup], [data-annotation-marker], [hidden], [aria-hidden='true'], [inert]";

function parentElement(element: Element): Element | null {
  if (element.parentElement) return element.parentElement;
  const root = element.getRootNode();
  return root instanceof ShadowRoot ? root.host : null;
}

function getIdentifiers(element: Element): Identifier[] {
  if (closestCrossingShadow(element, EXCLUDED_ELEMENTS) || isInaccessible(element)) {
    return [];
  }

  const identifiers: Identifier[] = [];
  for (const attribute of TEST_ID_ATTRIBUTES) {
    const value = element.getAttribute(attribute);
    if (value?.trim()) identifiers.push({ kind: "test-id", attribute, value });
  }

  const name = computeAccessibleName(element);
  let role = getRole(element);
  if (!element.hasAttribute("role")) {
    if (element.matches("section, form") && !name) role = null;
    const parent = parentElement(element);
    if (element.matches("header, footer") && parent &&
      closestCrossingShadow(parent, "article, aside, main, nav, section")) role = null;
  }
  if (role && !["generic", "none", "presentation"].includes(role)) {
    identifiers.push({ kind: "role", role, name });
  } else if (name) {
    identifiers.push({ kind: "name", value: name });
  }
  return identifiers;
}

function describeIdentifier(identifier: Identifier): string {
  switch (identifier.kind) {
    case "test-id":
      return `data test ID (${identifier.attribute}) equal to ${JSON.stringify(identifier.value)}`;
    case "role":
      return `accessibility role equal to ${JSON.stringify(identifier.role)}${
        identifier.name ? ` and name equal to ${JSON.stringify(identifier.name)}` : ""
      }`;
    case "name":
      return `accessibility name equal to ${JSON.stringify(identifier.value)}`;
  }
}

/** Capture exact identifiers while the selected element is available. */
export function getElementLocator(target: Element): string | undefined {
  if (closestCrossingShadow(target, EXCLUDED_ELEMENTS) || isInaccessible(target)) return undefined;
  const clauses: string[] = [];
  let hasTestId = false;
  let hasAccessibility = false;

  const collect = (element: Element, relation: "self" | "ancestor" | "nearby") => {
    const identifiers = getIdentifiers(element).filter((identifier) =>
      identifier.kind === "test-id" ? !hasTestId : !hasAccessibility,
    );
    if (identifiers.length === 0) return;

    const subject = relation === "self"
      ? "that has"
      : `whose ${relation === "ancestor" ? "ancestor" : "nearby component"} has`;
    clauses.push(`Find the component ${subject} ${identifiers.map(describeIdentifier).join(" and ")}.`);
    hasTestId ||= identifiers.some((identifier) => identifier.kind === "test-id");
    hasAccessibility ||= identifiers.some((identifier) => identifier.kind !== "test-id");
  };

  collect(target, "self");
  if (target.matches("body, html")) {
    return clauses.length > 0 ? clauses.join(" ") : undefined;
  }
  let ancestor = parentElement(target);
  while (ancestor && !ancestor.matches("body, html") && (!hasTestId || !hasAccessibility)) {
    collect(ancestor, "ancestor");
    ancestor = parentElement(ancestor);
  }

  // Search only the selected element's children and adjacent sibling branches.
  const candidates = [...target.children, ...(target.shadowRoot?.children ?? [])].slice(0, 48);
  if (target.previousElementSibling) candidates.push(target.previousElementSibling);
  if (target.nextElementSibling) candidates.push(target.nextElementSibling);
  const nearby = candidates.map((element) => ({ element, depth: 0 }));
  for (let index = 0; index < nearby.length && index < 50 && (!hasTestId || !hasAccessibility); index++) {
    const { element, depth } = nearby[index];
    if (closestCrossingShadow(element, EXCLUDED_ELEMENTS) || isInaccessible(element)) continue;
    collect(element, "nearby");
    if (depth < 2) {
      for (const child of [...element.children, ...(element.shadowRoot?.children ?? [])]) {
        if (nearby.length >= 50) break;
        nearby.push({ element: child, depth: depth + 1 });
      }
    }
  }

  return clauses.length > 0 ? clauses.join(" ") : undefined;
}

export function getAnnotationLocator(annotation: Annotation): string {
  if (annotation.elementLocator) return annotation.elementLocator;
  const position = annotation.isFixed ? "viewport" : "page";
  return `Find the component at ${annotation.x.toFixed(1)}% from the left and ${Math.round(annotation.y)}px from the top of the ${position}. No data test ID or accessibility role/name was captured.`;
}
