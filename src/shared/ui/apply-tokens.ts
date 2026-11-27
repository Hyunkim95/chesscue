import { tokenProperties } from "./tokens";

export function applyTokens(style: CSSStyleDeclaration): void {
  for (const [name, value] of tokenProperties()) style.setProperty(name, value);
}
