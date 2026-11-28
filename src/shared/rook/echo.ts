// Whether heard words are only Rook's own last line coming back through the
// mic: three or more words, every one of them from what Rook just said.
export function echoOf(heard: string, rookSaid: string): boolean {
  const words = (text: string) => text.toLowerCase().match(/[a-z0-9]+/g) ?? [];
  const said = new Set(words(rookSaid));
  const spoken = words(heard);
  return spoken.length >= 3 && spoken.every((word) => said.has(word));
}
